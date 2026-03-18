import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PixPayment } from "@/components/PixPayment";
import { ArrowLeft, ChevronRight, Check, MessageCircle, Star, Clock, AlertTriangle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, getDay, isBefore, startOfDay, addDays, isAfter, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/hooks/useAppearance";

type Step = "service" | "date" | "time" | "info" | "payment" | "confirm" | "confirmed";

const STEPS: Step[] = ["service", "date", "time", "info", "payment", "confirm"];

const WHATSAPP_NUMBER = "5571988335001";

// Convert "HH:MM" to minutes
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Convert minutes to "HH:MM"
const toTime = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

interface TimelineBlock {
  start: number; // minutes
  end: number;
  type: "booked" | "break" | "past" | "blocked";
  label?: string;
}

export default function Agendar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const appearance = useAppearance();
  const [step, setStep] = useState<Step>("service");
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "dinheiro">("dinheiro");
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

  const { data: businessSettings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("key, value");
      if (error) throw error;
      const map: Record<string, string> = {};
      data.forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
  });

  const slotInterval = Number(businessSettings?.slot_interval_minutes || 30);

  const { data: appointmentsRaw } = useQuery({
    queryKey: ["appointments", selectedDate?.toISOString()],
    enabled: !!selectedDate,
    refetchInterval: 15000,
    queryFn: async () => {
      const dateStr = format(selectedDate!, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("appointments")
        .select("appointment_time, service_id, status, actual_end_time, client_name, services(duration_minutes, buffer_minutes)")
        .eq("appointment_date", dateStr)
        .in("status", ["pendente", "confirmado"]);
      if (error) throw error;
      return data;
    },
  });

  // Real-time: instantly refetch when any appointment changes (cancel, update, etc.)
  useEffect(() => {
    const channel = supabase
      .channel('agendar-appointments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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

  // Derived
  const selectedServices = services?.filter((s) => selectedServiceIds.has(s.id)) || [];
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalBuffer = selectedServices.reduce((sum, s) => sum + (s.buffer_minutes ?? 0), 0);
  const totalServiceSpan = totalDuration + totalBuffer;
  const serviceDescription = selectedServices.map((s) => s.name).join(" + ");

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isFullDayBlocked = blockedSlots?.some((b) => b.full_day);
  const blockedTimes = new Set(blockedSlots?.filter((b) => b.blocked_time).map((b) => b.blocked_time!.slice(0, 5)) || []);

  const selectedDow = selectedDate ? getDay(selectedDate) : undefined;
  const dayConfig = scheduleConfig?.find((c) => c.day_of_week === selectedDow);

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

  // Build timeline blocks (occupied regions)
  const timelineBlocks = useMemo<TimelineBlock[]>(() => {
    if (!dayConfig) return [];
    const blocks: TimelineBlock[] = [];

    // Break block
    if (dayConfig.break_start && dayConfig.break_end) {
      blocks.push({
        start: toMin(dayConfig.break_start.slice(0, 5)),
        end: toMin(dayConfig.break_end.slice(0, 5)),
        type: "break",
        label: "Pausa / Almoço",
      });
    }

    // Booked appointments (defensive filter: never block timeline with cancelled appointments)
    (appointmentsRaw || [])
      .filter((a: any) => a.status !== "cancelado")
      .forEach((a: any) => {
        const apptStart = toMin(a.appointment_time.slice(0, 5));
        let apptEnd: number;
        if (a.actual_end_time) {
          apptEnd = toMin(a.actual_end_time.slice(0, 5));
        } else {
          const dur = a.services?.duration_minutes ?? 30;
          const buf = a.services?.buffer_minutes ?? 0;
          apptEnd = apptStart + dur + buf;
        }
        blocks.push({
          start: apptStart,
          end: apptEnd,
          type: "booked",
          label: a.client_name || "Ocupado",
        });
      });

    // Blocked time slots
    blockedTimes.forEach((t) => {
      blocks.push({
        start: toMin(t),
        end: toMin(t) + slotInterval,
        type: "blocked",
        label: "Bloqueado",
      });
    });

    // Past times (today only)
    if (selectedDate && isToday(selectedDate)) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const openMin = toMin(dayConfig.open_time?.slice(0, 5) || "08:00");
      if (nowMin > openMin) {
        blocks.push({
          start: openMin,
          end: nowMin,
          type: "past",
          label: "Passado",
        });
      }
    }

    return blocks.sort((a, b) => a.start - b.start);
  }, [dayConfig, appointmentsRaw, blockedTimes, selectedDate]);

  // Check if a proposed slot overlaps with any block
  const getSlotStatus = (slotStart: number, duration: number) => {
    const slotEnd = slotStart + duration;
    const openMin = toMin(dayConfig?.open_time?.slice(0, 5) || "08:00");
    const closeMin = toMin(dayConfig?.close_time?.slice(0, 5) || "21:00");

    if (slotEnd > closeMin) return { available: false, reason: "Excede o expediente" };
    if (slotStart < openMin) return { available: false, reason: "Antes da abertura" };

    // Check hard blocks (booked, blocked, past)
    for (const block of timelineBlocks) {
      if (block.type === "break") continue; // handled separately for smart fit
      if (slotStart < block.end && slotEnd > block.start) {
        return { available: false, reason: block.type === "past" ? "Horário passado" : "Horário ocupado" };
      }
    }

    // Check break overlap (smart fit)
    const breakBlock = timelineBlocks.find((b) => b.type === "break");
    if (breakBlock) {
      if (slotStart >= breakBlock.start && slotStart < breakBlock.end) {
        return { available: false, reason: "Dentro da pausa" };
      }
      if (slotEnd > breakBlock.start && slotStart < breakBlock.start) {
        const bleedMinutes = slotEnd - breakBlock.start;
        if (bleedMinutes <= 15) {
          return {
            available: true,
            warning: `Este serviço terminará ${bleedMinutes} min após o início da pausa`,
          };
        }
        return { available: false, reason: "Conflita com a pausa" };
      }
    }

    return { available: true };
  };

  // Generate available clickable slots without implicit rounding/step-to-5 behavior
  const timelineSlots = useMemo(() => {
    if (!dayConfig) return [];
    const openMin = toMin(dayConfig.open_time?.slice(0, 5) || "08:00");
    const closeMin = toMin(dayConfig.close_time?.slice(0, 5) || "21:00");
    const duration = totalServiceSpan || 30;
    const slotStep = Math.max(totalServiceSpan || slotInterval || 30, 1);
    const slots: { time: number; status: ReturnType<typeof getSlotStatus> }[] = [];
    const slotTimes = new Set<number>();

    // 1. Base slots follow selected service span (duration + admin interval)
    for (let m = openMin; m < closeMin; m += slotStep) {
      slotTimes.add(m);
    }

    // 2. Add exact end times of existing appointments (so next can start immediately)
    timelineBlocks
      .filter((b) => b.type === "booked")
      .forEach((b) => {
        if (b.end >= openMin && b.end < closeMin) {
          slotTimes.add(b.end);
        }
      });

    // 3. Add break_end as an available slot start (first slot after break)
    const breakBlk = timelineBlocks.find((b) => b.type === "break");
    if (breakBlk && breakBlk.end >= openMin && breakBlk.end < closeMin) {
      slotTimes.add(breakBlk.end);
    }

    // Sort and build final slots
    Array.from(slotTimes)
      .sort((a, b) => a - b)
      .forEach((m) => {
        const status = getSlotStatus(m, duration);
        slots.push({ time: m, status });
      });

    return slots;
  }, [dayConfig, totalServiceSpan, timelineBlocks, slotInterval]);

  // Pixel height per minute for timeline
  const PX_PER_MIN = 2.5;

  const createAppointment = useMutation({
    mutationFn: async () => {
      const firstServiceId = selectedServices[0]?.id;
      if (!firstServiceId) throw new Error("Selecione ao menos um serviço");

      // Check for duplicate appointment at the same date/time
      const dateStr = format(selectedDate!, "yyyy-MM-dd");
      const { data: existing, error: checkError } = await supabase
        .from("appointments")
        .select("id")
        .eq("appointment_date", dateStr)
        .eq("appointment_time", selectedTime)
        .in("status", ["pendente", "confirmado"]);
      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        throw new Error("Este horário já está ocupado. Por favor, escolha outro horário.");
      }

      const { data, error } = await supabase
        .from("appointments")
        .insert({
          client_name: clientName,
          client_phone: clientPhone,
          service_id: firstServiceId,
          appointment_date: dateStr,
          appointment_time: selectedTime,
          payment_method: "dinheiro" as any,
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
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao agendar. Tente novamente.");
    },
  });

  const submitRating = useMutation({
    mutationFn: async (stars: number) => {
      const { error } = await supabase.from("avaliacoes").insert([{ nome_cliente: clientName, estrelas: stars }]);
      if (error) throw error;
    },
    onSuccess: () => {
      setSubmittedRating(true);
      toast.success("Obrigado por avaliar o Fal!");
    },
    onError: () => {
      toast.error("Houve um erro ao enviar sua avaliação.");
    },
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

  // Selected time warning
  const selectedTimeWarning = selectedTime
    ? getSlotStatus(toMin(selectedTime), totalServiceSpan || 30).warning
    : undefined;

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
        {/* Step: Service */}
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
                      ? "border-[#d1b122] bg-[#d1b122]/10"
                      : "border-border bg-secondary"
                  )}
                >
                  <Checkbox
                    checked={selectedServiceIds.has(s.id)}
                    onCheckedChange={() => toggleService(s.id)}
                    className="data-[state=checked]:bg-[#d1b122] data-[state=checked]:border-[#d1b122]"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({s.duration_minutes} min)</span>
                  </div>
                  <span className="font-semibold text-[#d1b122]">R$ {Number(s.price).toFixed(2).replace(".", ",")}</span>
                </label>
              ))}
            </div>
            {selectedServiceIds.size > 0 && (
              <div className="mt-4 rounded-lg border border-[#d1b122]/30 bg-[#d1b122]/5 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total: <strong className="text-[#d1b122]">{serviceDescription}</strong></span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-sm text-muted-foreground">Duração: {totalDuration} min</span>
                  <span className="text-lg font-bold text-[#d1b122]">R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
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

        {/* Step: Time — VERTICAL TIMELINE */}
        {step === "time" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-primary">Escolha o horário</h2>
              {selectedTime && (
                <button
                  onClick={() => setSelectedTime("")}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
                >
                  <X className="h-3 w-3" /> Limpar
                </button>
              )}
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {selectedDate && format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              {" — "}{totalDuration} min necessários
            </p>

            {isFullDayBlocked ? (
              <p className="text-center text-muted-foreground">Este dia está bloqueado.</p>
            ) : dayConfig ? (
              <div className="relative ml-16 mr-2">
                {/* Timeline rail */}
                <div
                  className="absolute left-4 top-0 w-0.5 bg-border"
                  style={{
                    height: `${(toMin(dayConfig.close_time?.slice(0, 5) || "21:00") - toMin(dayConfig.open_time?.slice(0, 5) || "08:00")) * PX_PER_MIN}px`,
                  }}
                />

                {/* Time labels + slots */}
                {timelineSlots.map(({ time, status }) => {
                  const openMin = toMin(dayConfig.open_time?.slice(0, 5) || "08:00");
                  const top = (time - openMin) * PX_PER_MIN;
                  const timeStr = toTime(time);
                  const isSelected = selectedTime === timeStr;
                  const showLabel = time % 60 === 0 || time % 30 === 0;

                  // Find if this slot is inside a block
                  const blockHere = timelineBlocks.find(
                    (b) => time >= b.start && time < b.end
                  );
                  const isOccupied = !status.available;

                  return (
                    <div
                      key={time}
                      className="absolute flex items-center"
                      style={{ top: `${top}px`, left: 0, right: 0, height: `${20}px` }}
                    >
                      {/* Time label */}
                      <div
                        className="absolute text-[10px] font-mono text-muted-foreground"
                        style={{ left: "-56px", width: "48px", textAlign: "right" }}
                      >
                        {showLabel && timeStr}
                      </div>

                      {/* Dot on rail */}
                      <div
                        className={cn(
                          "absolute left-[13px] w-1.5 h-1.5 rounded-full z-10",
                          isSelected ? "bg-[#d1b122] scale-150" :
                            isOccupied ? "bg-muted-foreground/30" : "bg-[#d1b122]/60"
                        )}
                      />

                      {/* Slot button */}
                      <button
                        disabled={isOccupied}
                        onClick={() => setSelectedTime(timeStr)}
                        className={cn(
                          "ml-8 flex-1 rounded-md px-3 text-left text-xs transition-all h-full flex items-center gap-2",
                          isOccupied
                            ? "cursor-not-allowed"
                            : isSelected
                              ? "bg-[#d1b122] text-black font-semibold shadow-md"
                              : "hover:bg-[#d1b122]/10 text-foreground",
                          // Block visual styling
                          blockHere?.type === "booked" && "bg-muted/40 border-l-2 border-destructive/50",
                          blockHere?.type === "break" && "bg-muted/20 border-l-2 border-muted-foreground/30",
                          blockHere?.type === "past" && "opacity-30",
                          blockHere?.type === "blocked" && "bg-destructive/10 border-l-2 border-destructive/30",
                        )}
                      >
                        {blockHere && isOccupied ? (
                          <span className="text-xs text-muted-foreground line-through">
                            {timeStr} — {blockHere.label}
                          </span>
                        ) : (
                          <>
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>{timeStr}</span>
                            {status.warning && (
                              <span className="text-[10px] text-yellow-500 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Aviso
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}

                {/* Occupied blocks overlay */}
                {timelineBlocks.map((block, i) => {
                  const openMin = toMin(dayConfig.open_time?.slice(0, 5) || "08:00");
                  const closeMin = toMin(dayConfig.close_time?.slice(0, 5) || "21:00");
                  const clampedStart = Math.max(block.start, openMin);
                  const clampedEnd = Math.min(block.end, closeMin);
                  if (clampedEnd <= clampedStart) return null;
                  const top = (clampedStart - openMin) * PX_PER_MIN;
                  const height = (clampedEnd - clampedStart) * PX_PER_MIN;

                  return (
                    <div
                      key={`block-${i}`}
                      className={cn(
                        "absolute left-8 right-0 rounded-md pointer-events-none z-0 flex items-center px-3",
                        block.type === "booked" && "bg-muted/30 border border-muted-foreground/20",
                        block.type === "break" && "bg-yellow-900/10 border border-yellow-600/20",
                        block.type === "past" && "bg-muted/10",
                        block.type === "blocked" && "bg-destructive/10 border border-destructive/20",
                      )}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <span className="text-[9px] text-muted-foreground font-medium truncate">
                        {block.label} ({toTime(block.start)} - {toTime(block.end)})
                      </span>
                    </div>
                  );
                })}

                {/* Selected service preview block */}
                {selectedTime && (() => {
                  const openMin = toMin(dayConfig.open_time?.slice(0, 5) || "08:00");
                  const startMin = toMin(selectedTime);
                  const top = (startMin - openMin) * PX_PER_MIN;
                  const height = (totalDuration || 30) * PX_PER_MIN;
                  return (
                    <div
                      className="absolute left-8 right-0 rounded-md pointer-events-none z-20 bg-[#d1b122] flex flex-col justify-center px-3 py-1.5"
                      style={{ top: `${top}px`, minHeight: '45px', height: `${Math.max(height, 45)}px` }}
                    >
                      <span className="text-[12px] font-bold text-[#000000] leading-tight">
                        {serviceDescription}
                      </span>
                      <span className="text-[11px] text-[#000000]/80 leading-tight">
                        {toTime(startMin)} até {toTime(startMin + (totalDuration || 30))}
                      </span>
                    </div>
                  );
                })()}

                {/* Spacer for scroll */}
                <div style={{
                  height: `${(toMin(dayConfig.close_time?.slice(0, 5) || "21:00") - toMin(dayConfig.open_time?.slice(0, 5) || "08:00")) * PX_PER_MIN + 20}px`
                }} />
              </div>
            ) : (
              <p className="text-center text-muted-foreground">Configuração do dia não encontrada.</p>
            )}

            {/* Warning message */}
            {selectedTimeWarning && (
              <div className="mt-4 rounded-lg border border-yellow-600/30 bg-yellow-900/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-sm text-yellow-500">{selectedTimeWarning}</p>
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
                  className="border-border bg-secondary text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Telefone</label>
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(71) 99999-9999"
                  className="border-border bg-secondary text-foreground"
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
                  paymentMethod === "pix" ? "border-[#d1b122] bg-[#d1b122]/10" : "border-border bg-secondary"
                )}
              >
                <span>💎</span>
                <span className="font-medium text-foreground">Pix</span>
              </button>
              <button
                onClick={() => setPaymentMethod("dinheiro")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-5 py-4 text-left transition-colors",
                  paymentMethod === "dinheiro" ? "border-[#d1b122] bg-[#d1b122]/10" : "border-border bg-secondary"
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
              <p className="text-sm text-foreground"><span className="text-muted-foreground">Nome: </span><strong>{clientName}</strong></p>
              <p className="text-sm text-foreground"><span className="text-muted-foreground">Telefone: </span><strong>{clientPhone}</strong></p>
              <p className="text-sm text-foreground"><span className="text-muted-foreground">Data: </span><strong>{selectedDate && format(selectedDate, "dd/MM/yyyy")}</strong></p>
              <p className="text-sm text-foreground"><span className="text-muted-foreground">Horário: </span><strong>{selectedTime}</strong></p>
              <p className="text-sm text-foreground"><span className="text-muted-foreground">Serviço: </span><strong>{serviceDescription}</strong></p>
              <p className="text-sm text-foreground"><span className="text-muted-foreground">Duração: </span><strong>{totalDuration} min</strong></p>
              <p className="text-sm text-foreground"><span className="text-muted-foreground">Pagamento: </span><strong>{paymentMethod === "pix" ? "Pix" : "Dinheiro"}</strong></p>
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-sm"><span className="text-muted-foreground">Total: </span><span className="font-bold text-[#d1b122]">R$ {totalPrice.toFixed(2).replace(".", ",")}</span></p>
              </div>
            </div>
            {selectedTimeWarning && (
              <div className="mt-3 rounded-lg border border-yellow-600/30 bg-yellow-900/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-sm text-yellow-500">{selectedTimeWarning}</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Confirmed */}
        {step === "confirmed" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(142,70%,45%)]/20">
              <Check className="h-8 w-8 text-[hsl(142,70%,45%)]" />
            </div>
            <h2 className="mb-4 text-2xl font-bold text-[#d1b122]">Agendado!</h2>
            <div className="mb-6 space-y-1 rounded-lg border border-border bg-card p-5 text-left">
              <p className="text-sm"><span className="text-muted-foreground">Nome:</span> <strong>{clientName}</strong></p>
              <p className="text-sm"><span className="text-muted-foreground">Serviço:</span> <strong>{serviceDescription}</strong></p>
              <p className="text-sm"><span className="text-muted-foreground">Data:</span> <strong>{selectedDate && format(selectedDate, "dd/MM/yyyy")}</strong></p>
              <p className="text-sm"><span className="text-muted-foreground">Horário:</span> <strong>{selectedTime}</strong></p>
              <p className="text-sm"><span className="text-muted-foreground">Pagamento:</span> <strong>{paymentMethod === "pix" ? "Pix" : "Dinheiro"}</strong></p>
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-sm"><span className="text-muted-foreground">Total:</span> <span className="font-bold text-[#d1b122]">R$ {totalPrice.toFixed(2).replace(".", ",")}</span></p>
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
                          hoveredRating >= star
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
              <div className="mb-6 rounded-lg border border-[#d1b122]/30 bg-[#d1b122]/5 p-4 text-center">
                <p className="text-[#d1b122] font-medium">Avaliação recebida! Muito obrigado. ⭐</p>
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

      {/* Bottom continue button */}
      {step !== "confirmed" && (
        <div className="fixed bottom-0 left-0 right-0 bg-background p-4">
          <Button
            className="w-full gap-2 text-base bg-[#d1b122] hover:bg-[#bfa01e] text-black font-bold"
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
