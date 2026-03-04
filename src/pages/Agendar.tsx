import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PixPayment } from "@/components/PixPayment";
import { ArrowLeft, ChevronRight, Check, MessageCircle, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, getDay, isBefore, startOfDay, addDays, isAfter, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/hooks/useAppearance";

type Step = "service" | "date" | "time" | "info" | "payment" | "confirm" | "confirmed";

const STEPS: Step[] = ["service", "date", "time", "info", "payment", "confirm"];

// Generate time slots dynamically based on schedule config and interval
const generateTimeSlots = (openTime = "08:00", closeTime = "21:00", intervalMinutes = 30) => {
  const slots: string[] = [];
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  let mins = oh * 60 + om;
  const endMins = ch * 60 + cm;
  while (mins < endMins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    mins += intervalMinutes;
  }
  return slots;
};

// Check if a slot overlaps with the break period
// A slot is blocked if it STARTS during break OR if the service would bleed into break
const overlapsBreak = (
  slotTime: string,
  durationMinutes: number,
  breakStart?: string | null,
  breakEnd?: string | null
): boolean => {
  if (!breakStart || !breakEnd) return false;
  const [sh, sm] = slotTime.split(":").map(Number);
  const slotStart = sh * 60 + sm;
  const slotEnd = slotStart + durationMinutes;
  const [bsh, bsm] = breakStart.split(":").map(Number);
  const [beh, bem] = breakEnd.split(":").map(Number);
  const bStart = bsh * 60 + bsm;
  const bEnd = beh * 60 + bem;
  // Slot is blocked if: slot starts during break, OR service bleeds into break
  return slotStart < bEnd && slotEnd > bStart;
};

// Check if a slot collides with existing appointments considering duration
// Uses actual_end_time for early-finished appointments
const overlapsExisting = (
  slotTime: string,
  totalDuration: number,
  totalBuffer: number,
  bookedAppointments: { appointment_time: string; duration_minutes: number; buffer_minutes: number; actual_end_time?: string | null }[]
): boolean => {
  const [sh, sm] = slotTime.split(":").map(Number);
  const slotStart = sh * 60 + sm;
  const slotEnd = slotStart + totalDuration;

  for (const appt of bookedAppointments) {
    const [ah, am] = appt.appointment_time.split(":").map(Number);
    const apptStart = ah * 60 + am;
    let apptEnd: number;
    if (appt.actual_end_time) {
      // Early finish: use actual end time instead of scheduled duration
      const [eh, em] = appt.actual_end_time.split(":").map(Number);
      apptEnd = eh * 60 + em;
    } else {
      apptEnd = apptStart + appt.duration_minutes + appt.buffer_minutes;
    }
    if (slotStart < apptEnd && slotEnd > apptStart) return true;
  }
  return false;
};

const WHATSAPP_NUMBER = "5571988335001";

export default function Agendar() {
  const navigate = useNavigate();
  const appearance = useAppearance();
  const [step, setStep] = useState<Step>("service");
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "dinheiro">("pix");

  // Rating states
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submittedRating, setSubmittedRating] = useState(false);

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: scheduleConfig } = useQuery({
    queryKey: ["schedule_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_config").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: appointmentsRaw } = useQuery({
    queryKey: ["appointments", selectedDate?.toISOString()],
    enabled: !!selectedDate,
    queryFn: async () => {
      const dateStr = format(selectedDate!, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("appointments")
        .select("appointment_time, service_id, status, actual_end_time, services(duration_minutes, buffer_minutes)")
        .eq("appointment_date", dateStr)
        .in("status", ["pendente", "confirmado"]);
      if (error) throw error;
      return data;
    },
  });

  const { data: blockedSlots } = useQuery({
    queryKey: ["blocked_slots", selectedDate?.toISOString()],
    enabled: !!selectedDate,
    queryFn: async () => {
      const dateStr = format(selectedDate!, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("blocked_slots")
        .select("*")
        .eq("blocked_date", dateStr);
      if (error) throw error;
      return data;
    },
  });

  const { data: allBlockedDates } = useQuery({
    queryKey: ["blocked_dates_calendar"],
    queryFn: async () => {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const maxStr = format(addDays(new Date(), 7), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("blocked_slots")
        .select("blocked_date")
        .eq("full_day", true)
        .gte("blocked_date", todayStr)
        .lte("blocked_date", maxStr);
      if (error) throw error;
      return new Set(data.map((b) => b.blocked_date));
    },
  });

  // Derived: selected services
  const selectedServices = services?.filter((s) => selectedServiceIds.has(s.id)) || [];
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalBuffer = selectedServices.length > 0 ? Math.max(...selectedServices.map((s) => s.buffer_minutes)) : 5;
  const serviceDescription = selectedServices.map((s) => s.name).join(" + ");

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build booked appointments with duration info for overlap checking
  const bookedAppointments = (appointmentsRaw || []).map((a: any) => ({
    appointment_time: a.appointment_time,
    duration_minutes: a.services?.duration_minutes ?? 30,
    buffer_minutes: a.services?.buffer_minutes ?? 5,
    actual_end_time: a.actual_end_time || null,
  }));

  const isFullDayBlocked = blockedSlots?.some((b) => b.full_day);
  const blockedTimes = new Set(blockedSlots?.filter((b) => b.blocked_time).map((b) => b.blocked_time!.slice(0, 5)) || []);

  // Dynamic slot interval: use the minimum duration of selected services, or fallback to 15 min steps
  const dynamicInterval = selectedServices.length > 0
    ? Math.min(...selectedServices.map((s) => s.duration_minutes))
    : 15;
  // Use 15 min as the base grid interval for flexibility
  const slotInterval = 15;

  const selectedDow = selectedDate ? getDay(selectedDate) : undefined;
  const dayConfig = scheduleConfig?.find((c) => c.day_of_week === selectedDow);
  const timeSlots = generateTimeSlots(dayConfig?.open_time?.slice(0, 5), dayConfig?.close_time?.slice(0, 5), slotInterval);

  const maxDate = addDays(startOfDay(new Date()), 7);

  const disabledDays = (date: Date) => {
    if (isBefore(date, startOfDay(new Date()))) return true;
    if (isAfter(date, maxDate)) return true;
    const dow = getDay(date);
    const config = scheduleConfig?.find((c) => c.day_of_week === dow);
    if (!config?.is_open) return true;
    const dateStr = format(date, "yyyy-MM-dd");
    if (allBlockedDates?.has(dateStr)) return true;
    return false;
  };

  const createAppointment = useMutation({
    mutationFn: async () => {
      const firstServiceId = selectedServices[0]?.id;
      if (!firstServiceId) throw new Error("Selecione ao menos um serviço");
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          client_name: clientName,
          client_phone: clientPhone,
          service_id: firstServiceId,
          appointment_date: format(selectedDate!, "yyyy-MM-dd"),
          appointment_time: selectedTime,
          payment_method: paymentMethod,
          price: totalPrice,
          service_description: serviceDescription,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setStep("confirmed");
      toast.success("Agendamento realizado com sucesso!");
      const dateStr = selectedDate ? format(selectedDate, "dd/MM/yyyy") : "";
      const valor = `R$ ${totalPrice.toFixed(2).replace(".", ",")}`;
      const pixReminder = paymentMethod === "pix" ? "\n\n⚠️ Lembre-se de enviar o comprovante do Pix para garantir sua vaga!" : "";
      const barberMsg = `🔔 *Novo Agendamento!*\n\n👤 Cliente: ${clientName}\n📱 Tel: ${clientPhone}\n✂️ Serviço: ${serviceDescription}\n📅 Data: ${dateStr} às ${selectedTime}\n💰 Valor: ${valor}\n💳 Pagamento: ${paymentMethod === "pix" ? "Pix" : "Dinheiro"}${pixReminder}`;
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(barberMsg)}`, "_blank");
    },
    onError: () => {
      toast.error("Erro ao agendar. Tente novamente.");
    },
  });

  const submitRating = useMutation({
    mutationFn: async (stars: number) => {
      const payload = {
        nome_cliente: clientName,
        estrelas: stars
      };

      const { error } = await supabase
        .from("avaliacoes")
        .insert([payload]);

      if (error) throw error;
    },
    onSuccess: () => {
      setSubmittedRating(true);
      setHoveredRating(0);
      toast.success("Obrigado por avaliar o Fal!");
    },
    onError: () => {
      toast.error("Houve um erro ao enviar sua avaliação.");
    }
  });

  const currentStepIndex = STEPS.indexOf(step === "confirmed" ? "confirm" : step);

  const goBack = () => {
    if (step === "service") return navigate("/");
    const prev = STEPS[currentStepIndex - 1];
    if (prev) setStep(prev);
  };

  const canContinue = () => {
    switch (step) {
      case "service": return selectedServiceIds.size > 0;
      case "date": return !!selectedDate;
      case "time": return !!selectedTime;
      case "info": return clientName.trim().length > 0 && clientPhone.trim().length > 0;
      case "payment": return !!paymentMethod;
      case "confirm": return true;
      default: return false;
    }
  };

  const handleContinue = () => {
    if (step === "confirm") {
      createAppointment.mutate();
      return;
    }
    const next = STEPS[currentStepIndex + 1];
    if (next) setStep(next);
  };

  const whatsappMessage = () => {
    const dateStr = selectedDate ? format(selectedDate, "dd/MM/yyyy") : "";
    const valor = `R$ ${totalPrice.toFixed(2).replace(".", ",")}`;
    const msg = `✅ Agendamento Confirmado!\n\n📍 Barbearia Fal\n👤 Cliente: ${clientName}\n✂️ Serviço: ${serviceDescription}\n📅 Data: ${dateStr} às ${selectedTime}\n💰 Valor: ${valor}\n\nPor favor, envie o comprovante do Pix para garantir sua vaga!`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  const whatsappComprovante = () => {
    const msg = `Olá! Segue o comprovante do Pix para o agendamento:\n\n👤 Nome: ${clientName}\n✂️ Serviço: ${serviceDescription}\n💵 Valor: R$ ${totalPrice.toFixed(2).replace(".", ",")}`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <main
      className="relative min-h-screen"
      style={{
        backgroundImage: `linear-gradient(rgba(10,10,10,0.82), rgba(10,10,10,0.82)), url("${appearance?.background_image || '/images/site-bg.png'}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={goBack} className="text-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold uppercase tracking-wider text-foreground">
          Agendar Horário
        </h1>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 px-4 pb-6">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= currentStepIndex ? "bg-primary" : "bg-border"
            )}
          />
        ))}
      </div>

      <div className="px-4 pb-24">
        {/* Step: Service — now multi-select with checkboxes */}
        {step === "service" && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-primary">Escolha os serviços</h2>
            <div className="space-y-2">
              {services?.map((s) => (
                <label
                  key={s.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-5 py-4 cursor-pointer transition-colors",
                    selectedServiceIds.has(s.id)
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary"
                  )}
                >
                  <Checkbox
                    checked={selectedServiceIds.has(s.id)}
                    onCheckedChange={() => toggleService(s.id)}
                  />
                  <span className="flex-1 font-medium text-foreground">{s.name}</span>
                  <span className="font-semibold text-primary">R$ {Number(s.price).toFixed(2).replace(".", ",")}</span>
                </label>
              ))}
            </div>
            {selectedServiceIds.size > 0 && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total: <strong className="text-primary">{serviceDescription}</strong></span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-sm text-muted-foreground">Duração: {totalDuration} min</span>
                  <span className="text-lg font-bold text-primary">R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Date */}
        {step === "date" && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-primary">Escolha a data</h2>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={disabledDays}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </div>
          </div>
        )}

        {/* Step: Time — uses totalDuration for overlap checking */}
        {step === "time" && (
          <div>
            <h2 className="mb-1 text-lg font-semibold text-primary">Escolha o horário</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {selectedDate && format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              {" — "}{totalDuration} min necessários
            </p>
            {isFullDayBlocked ? (
              <p className="text-center text-muted-foreground">Este dia está bloqueado.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {timeSlots.map((t) => {
                  const duration = totalDuration || 30;
                  const buffer = totalBuffer || 5;
                  const inBreak = overlapsBreak(t, duration, dayConfig?.break_start, dayConfig?.break_end);
                  const isPast = selectedDate && isToday(selectedDate) && (() => {
                    const [h, m] = t.split(":").map(Number);
                    const now = new Date();
                    return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
                  })();
                  // Check overlap with existing booked appointments
                  const overlapsBooked = overlapsExisting(t, duration, buffer, bookedAppointments);
                  const taken = overlapsBooked || blockedTimes.has(t) || inBreak || !!isPast;

                  // Check if slot + duration fits within closing time
                  const [sh, sm] = t.split(":").map(Number);
                  const slotEnd = sh * 60 + sm + duration;
                  const [ch, cm] = (dayConfig?.close_time?.slice(0, 5) || "21:00").split(":").map(Number);
                  const closeMin = ch * 60 + cm;
                  const exceedsClose = slotEnd > closeMin;

                  return (
                    <button
                      key={t}
                      disabled={taken || exceedsClose}
                      onClick={() => setSelectedTime(t)}
                      className={cn(
                        "rounded-lg border px-2 py-3 text-center text-sm font-medium transition-colors",
                        taken || exceedsClose
                          ? "cursor-not-allowed border-border bg-muted/20 text-muted-foreground line-through"
                          : selectedTime === t
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary text-foreground hover:border-primary"
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step: Info */}
        {step === "info" && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-primary">Seus dados</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Nome</label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Seu nome"
                  className="border-border bg-secondary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Telefone</label>
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(71) 99999-9999"
                  className="border-border bg-secondary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step: Payment */}
        {step === "payment" && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-primary">Forma de Pagamento</h2>
            <div className="space-y-2">
              <button
                onClick={() => setPaymentMethod("pix")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-5 py-4 text-left transition-colors",
                  paymentMethod === "pix" ? "border-primary bg-primary/10" : "border-border bg-secondary"
                )}
              >
                <span>💎</span>
                <span className="font-medium text-foreground">Pix</span>
              </button>
              <button
                onClick={() => setPaymentMethod("dinheiro")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-5 py-4 text-left transition-colors",
                  paymentMethod === "dinheiro" ? "border-primary bg-primary/10" : "border-border bg-secondary"
                )}
              >
                <span>💵</span>
                <span className="font-medium text-foreground">Dinheiro (pagar no local)</span>
              </button>
            </div>

            {paymentMethod === "pix" && (
              <div className="mt-6">
                <PixPayment
                  valor={`R$ ${totalPrice.toFixed(2).replace(".", ",")}`}
                  onSendComprovante={() => {
                    window.open(whatsappComprovante(), "_blank");
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-primary">Confirmar Agendamento</h2>
            <div className="space-y-1 rounded-lg border border-border bg-card p-5">
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Nome: </span>
                <strong>{clientName}</strong>
              </p>
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Telefone: </span>
                <strong>{clientPhone}</strong>
              </p>
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Data: </span>
                <strong>{selectedDate && format(selectedDate, "dd/MM/yyyy")}</strong>
              </p>
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Horário: </span>
                <strong>{selectedTime}</strong>
              </p>
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Serviço: </span>
                <strong>{serviceDescription}</strong>
              </p>
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Duração: </span>
                <strong>{totalDuration} min</strong>
              </p>
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Pagamento: </span>
                <strong>{paymentMethod === "pix" ? "Pix" : "Dinheiro"}</strong>
              </p>
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-bold text-primary">R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step: Confirmed (success) */}
        {step === "confirmed" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(142,70%,45%)]/20">
              <Check className="h-8 w-8 text-[hsl(142,70%,45%)]" />
            </div>
            <h2 className="mb-4 text-2xl font-bold text-primary">Agendado!</h2>
            <div className="mb-6 space-y-1 rounded-lg border border-border bg-card p-5 text-left">
              <p className="text-sm"><span className="text-muted-foreground">Nome:</span> <strong>{clientName}</strong></p>
              <p className="text-sm"><span className="text-muted-foreground">Serviço:</span> <strong>{serviceDescription}</strong></p>
              <p className="text-sm"><span className="text-muted-foreground">Data:</span> <strong>{selectedDate && format(selectedDate, "dd/MM/yyyy")}</strong></p>
              <p className="text-sm"><span className="text-muted-foreground">Horário:</span> <strong>{selectedTime}</strong></p>
              <p className="text-sm"><span className="text-muted-foreground">Pagamento:</span> <strong>{paymentMethod === "pix" ? "Pix" : "Dinheiro"}</strong></p>
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-sm"><span className="text-muted-foreground">Total:</span> <span className="font-bold text-primary">R$ {totalPrice.toFixed(2).replace(".", ",")}</span></p>
              </div>
            </div>
            <a href={whatsappMessage()} target="_blank" rel="noopener noreferrer" className="block mb-6">
              <Button className="w-full gap-2 bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,40%)] text-foreground">
                <MessageCircle className="h-5 w-5" />
                Enviar confirmação via WhatsApp
              </Button>
            </a>

            {!submittedRating ? (
              <div className="mb-6 rounded-lg border border-border bg-card p-5 text-center transition-all">
                <h3 className="mb-3 text-lg font-bold text-foreground">Avalie sua Experiência</h3>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      disabled={submitRating.isPending}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      onClick={() => submitRating.mutate(star)}
                      className="transition-transform hover:scale-110 focus:outline-none"
                    >
                      <Star
                        className={cn(
                          "h-10 w-10 transition-colors",
                          (hoveredRating >= star)
                            ? "fill-yellow-500 text-yellow-500"
                            : "text-muted-foreground/30"
                        )}
                      />
                    </button>
                  ))}
                </div>
                {submitRating.isPending && <p className="mt-2 text-sm text-muted-foreground">Enviando...</p>}
              </div>
            ) : (
              <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
                <p className="text-primary font-medium">Avaliação recebida! Muito obrigado. ⭐</p>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              Voltar ao início
            </Button>
          </div>
        )}
      </div>

      <div className="w-full py-4 flex justify-center pb-24">
        <span className="text-[10px] text-muted-foreground/40 font-medium z-0">
          Desenvolvido por Michael Pithon
        </span>
      </div>

      {/* Bottom continue button (fixed) */}
      {step !== "confirmed" && (
        <div className="fixed bottom-0 left-0 right-0 bg-background p-4">
          <Button
            className="w-full gap-2 text-base"
            disabled={!canContinue() || createAppointment.isPending}
            onClick={handleContinue}
          >
            {step === "confirm"
              ? createAppointment.isPending ? "Agendando..." : "Confirmar Agendamento"
              : <>Continuar <ChevronRight className="h-4 w-4" /></>
            }
          </Button>
        </div>
      )}

      <WhatsAppButton />
    </main>
  );
}
