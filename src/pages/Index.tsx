import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Scissors, Clock, MapPin, Phone, Star, ChevronDown, ChevronUp, X, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import logoFalFallback from "@/assets/logo-fal.png";
import { useBusinessName } from "@/hooks/useBusinessName";
import { useAppearance } from "@/hooks/useAppearance";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const { businessName } = useBusinessName();
  const appearance = useAppearance();
  const queryClient = useQueryClient();

  // ── "Meus Agendamentos" widget state ──
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [cancelThreshold, setCancelThreshold] = useState(60); // minutes, from business_settings

  // Load cancellation threshold
  useEffect(() => {
    supabase
      .from("business_settings")
      .select("value")
      .eq("key", "cancelamento_antecedencia")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setCancelThreshold(Number(data.value));
      });
  }, []);

  const { data: reviewsData } = useQuery({
    queryKey: ["avaliacoes_resumo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avaliacoes").select("estrelas");
      if (error) { console.error("Erro ao buscar avaliações:", error); return { average: 0, total: 0 }; }
      if (!data || data.length === 0) return { average: 0, total: 0 };
      const total = data.length;
      const sum = data.reduce((acc, curr) => acc + (curr.estrelas || 0), 0);
      return { average: Number((sum / total).toFixed(1)), total };
    },
  });

  // Query appointments by phone
  const { data: myAppointments, isLoading: loadingAppts } = useQuery({
    queryKey: ["my-appointments", searchPhone],
    enabled: searchPhone.length >= 8,
    queryFn: async () => {
      // Normalize: keep only digits
      const digits = searchPhone.replace(/\D/g, "");
      const { data, error } = await supabase
        .from("appointments")
        .select("id, client_name, appointment_date, appointment_time, service_description, services(name), price, status")
        .or(`client_phone.ilike.%${digits}%,client_phone.ilike.%${searchPhone}%`)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: true })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("cancel_appointment_by_phone" as any, {
        _appointment_id: id,
        _phone: searchPhone,
      } as any);
      if (error) throw error;
      if (!data) throw new Error("Não foi possível confirmar o cancelamento.");
      return true;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-appointments", searchPhone] }),
        queryClient.invalidateQueries({ queryKey: ["appointments"] }),
        queryClient.refetchQueries({ queryKey: ["my-appointments", searchPhone], type: "active" }),
        queryClient.refetchQueries({ queryKey: ["appointments"], type: "active" }),
      ]);
      toast.success("Horário liberado com sucesso!");
    },
    onError: (err: any) => toast.error(err?.message || "Não foi possível cancelar. Tente novamente."),
  });

  // Returns: "cancel" | "past" | "grace" | "blocked" | "already_cancelled"
  const getCancelStatus = (appt: any): "cancel" | "past" | "grace" | "blocked" | "already_cancelled" => {
    if (appt.status === "cancelado") return "already_cancelled";
    if (appt.status === "finalizado") return "past";

    const apptDateTime = new Date(`${appt.appointment_date}T${appt.appointment_time}`);
    const now = new Date();
    const diffMin = (apptDateTime.getTime() - now.getTime()) / (1000 * 60);

    // Already in the past
    if (diffMin < 0) return "past";

    // Within 5-min grace window (just booked): check created_at if available, otherwise allow
    // We don't have created_at in this query, so we use booking time as proxy:
    // If appointment is today AND time hasn't passed yet, apply threshold rule
    // Grace: if appointment was created very recently (we'll use a simple heuristic:
    // if it's within 5 min of now being *after* the appointment was likely created)
    // Since we don't have created_at, we'll allow cancellation if diffMin > threshold OR diffMin <= threshold but more than enough time
    // Actually let's be safe: allow if diffMin > threshold
    if (diffMin > cancelThreshold) return "cancel";

    return "blocked";
  };

  const handleSearch = () => {
    if (phoneInput.trim().length < 8) {
      toast.error("Digite ao menos 8 dígitos do telefone.");
      return;
    }
    setSearchPhone(phoneInput.trim());
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const statusLabel: Record<string, string> = {
    pendente: "Pendente",
    confirmado: "Confirmado",
    finalizado: "Concluído",
    cancelado: "Cancelado",
  };

  const statusColor: Record<string, string> = {
    pendente: "text-yellow-400",
    confirmado: "text-blue-400",
    finalizado: "text-green-400",
    cancelado: "text-red-400",
  };

  return (
    <main
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden pb-[160px] sm:pb-0"
      style={{
        backgroundImage: `linear-gradient(rgba(10,10,10,0.82), rgba(10,10,10,0.82)), url("${appearance?.background_image || '/images/site-bg.png'}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* Sharp logo on top */}
        <div className="mb-8">
          <img
            src={appearance?.logo_image || logoFalFallback}
            alt={`${businessName} Logo`}
            className="h-48 w-auto max-w-[80vw] rounded-3xl object-contain drop-shadow-2xl sm:h-56 md:h-64"
          />
        </div>

        {/* Title */}
        <h1 className="mb-2 text-4xl font-bold uppercase tracking-widest text-foreground sm:text-5xl md:text-6xl">
          {businessName.split(" ").map((word, i, arr) =>
            i === arr.length - 1 ? <span key={i} className="text-primary">{word}</span> : <span key={i}>{word} </span>
          )}
        </h1>

        <p className="mb-1 text-base tracking-[0.25em] uppercase text-muted-foreground sm:text-lg">
          Estilo &amp; Atitude
        </p>
        <div className="mb-8 h-px w-24 bg-primary/40" />

        {/* CTA */}
        <Button
          size="lg"
          className="mb-10 gap-3 rounded-full px-10 py-6 text-base font-bold uppercase tracking-wider shadow-lg transition-all hover:shadow-xl hover:scale-105 sm:text-lg sm:px-14"
          style={{ backgroundColor: '#d1b122', color: '#000' }}
          onClick={() => navigate("/agendar")}
        >
          <Scissors className="h-5 w-5" />
          Agendar Horário
        </Button>

        {/* Info row */}
        <div className="flex flex-wrap items-center justify-center gap-6" style={{ color: appearance?.info_color ? `hsl(${appearance.info_color})` : undefined }}>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm">Ter–Sáb · 08h às 21h</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <span className="text-sm">(71) 98833-5001</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm">Salvador – BA</span>
          </div>
        </div>
      </div>

      {/* ── Meus Agendamentos Widget ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        {/* Collapsed toggle */}
        <div className="flex justify-center">
          <button
            onClick={() => setWidgetOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-t-xl border border-b-0 border-white/10 bg-black/70 px-5 py-2 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:text-primary"
          >
            {widgetOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            Meus Agendamentos
          </button>
        </div>

        {/* Expanded panel */}
        {widgetOpen && (
          <div className="border-t border-white/10 bg-black/80 backdrop-blur-md px-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="mx-auto max-w-lg pb-24">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">Consultar agendamentos por telefone</p>
                <button onClick={() => setWidgetOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search row */}
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="(71) 99999-9999"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 border-white/20 bg-white/5 text-foreground placeholder:text-muted-foreground/50 text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleSearch}
                  style={{ backgroundColor: '#d1b122', color: '#000' }}
                  className="font-semibold px-4 shrink-0"
                >
                  Buscar
                </Button>
              </div>

              {/* Results */}
              {loadingAppts && (
                <p className="text-center text-xs text-muted-foreground py-4">Buscando...</p>
              )}

              {!loadingAppts && searchPhone && myAppointments && myAppointments.filter((a: any) => a.status !== "cancelado").length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-6">
                  Nenhum agendamento ativo encontrado para este número.
                </p>
              )}

              {!loadingAppts && myAppointments && myAppointments.filter((a: any) => a.status !== "cancelado").length > 0 && (
                <div className="space-y-2">
                  {myAppointments.filter((a: any) => a.status !== "cancelado").map((a: any) => {
                    const cancelStatus = getCancelStatus(a);
                    const isCancelled = a.status === "cancelado";
                    const serviceName = a.service_description || a.services?.name || "Serviço";

                    return (
                      <div
                        key={a.id}
                        className={`rounded-xl border px-4 py-3 transition-opacity ${isCancelled
                          ? "border-white/5 bg-white/3 opacity-50"
                          : "border-white/10 bg-white/5"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{a.client_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(a.appointment_date)} · {a.appointment_time?.slice(0, 5)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{serviceName}</p>
                            <p className="text-xs font-medium text-primary mt-0.5">
                              R$ {Number(a.price).toFixed(2).replace(".", ",")}
                            </p>
                          </div>

                          {/* Status + action */}
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`text-[11px] font-semibold uppercase tracking-wide ${statusColor[a.status] || "text-muted-foreground"}`}>
                              {statusLabel[a.status] || a.status}
                            </span>

                            {cancelStatus === "cancel" && (
                              <button
                                onClick={() => {
                                  if (confirm("Confirmar cancelamento deste agendamento?")) {
                                    cancelMutation.mutate(a.id);
                                  }
                                }}
                                disabled={cancelMutation.isPending}
                                className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              >
                                {cancelMutation.isPending ? "Cancelando..." : "Cancelar"}
                              </button>
                            )}

                            {cancelStatus === "blocked" && (
                              <div className="flex items-center gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-1">
                                <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
                                <span className="text-[10px] text-yellow-400 leading-tight max-w-[120px]">
                                  Prazo p/ cancelar encerrado
                                </span>
                              </div>
                            )}

                            {cancelStatus === "past" && (
                              <span className="text-[10px] text-muted-foreground">
                                Horário já passou
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-3 text-center text-[10px] text-muted-foreground/40">
                Problemas? Fale pelo WhatsApp com a barbearia.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Admin link + credits footer (above widget toggle) */}
      <footer className="absolute bottom-32 sm:bottom-12 z-20 w-full flex flex-col items-center gap-3 px-4 pb-20 sm:pb-0">
        <button
          onClick={() => navigate("/admin-login")}
          className="text-[11px] xs:text-[10px] text-muted-foreground/40 transition-colors hover:text-primary py-2 px-4 relative z-30 mb-1"
        >
          Área do Barbeiro
        </button>
        <span className="text-[10px] xs:text-[9px] text-muted-foreground/40 font-medium">
          Desenvolvido por Michael Pithon
        </span>
      </footer>

      {reviewsData && reviewsData.total > 0 && (
        <div className="fixed bottom-20 right-4 z-50 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-md shadow-lg">
          <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
          <span className="font-bold text-white text-xs">{reviewsData.average}</span>
          <span className="text-muted-foreground text-[10px]">({reviewsData.total})</span>
        </div>
      )}

      <WhatsAppButton />
    </main>
  );
};

export default Index;
