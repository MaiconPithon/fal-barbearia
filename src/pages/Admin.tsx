import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LogOut, Calendar as CalendarIcon, DollarSign, UserPlus, Home, Settings, Clock, Ban, Trash2, KeyRound, X, Shield, MessageCircle, Pencil, Palette, Star, Zap, Plus, EyeOff, Eye } from "lucide-react";
import { EditAppointmentModal } from "@/components/EditAppointmentModal";
import { AppearanceTab } from "@/components/AppearanceTab";
import { QuickSale } from "@/components/QuickSale";
import { ImageUpload } from "@/components/ImageUpload";
import { useAppearance } from "@/hooks/useAppearance";
import { cn } from "@/lib/utils";
import { useBusinessName } from "@/hooks/useBusinessName";
import type { Tables } from "@/integrations/supabase/types";

type Appointment = Tables<"appointments"> & { services: { name: string; duration_minutes: number; buffer_minutes: number } | null };

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  confirmado: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  finalizado: "bg-green-600/20 text-green-400 border-green-600/30",
  cancelado: "bg-red-600/20 text-red-400 border-red-600/30",
};

export default function Admin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [blockDate, setBlockDate] = useState<Date | undefined>();
  const [blockReason, setBlockReason] = useState("");
  const [filterDate, setFilterDate] = useState<Date | undefined>();
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [newUserPassword, setNewUserPassword] = useState("");
  const [businessNameInput, setBusinessNameInput] = useState("");
  const [slotIntervalInput, setSlotIntervalInput] = useState("30");
  const [cancelamentoAntecedencia, setCancelamentoAntecedencia] = useState("60");
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [serviceForm, setServiceForm] = useState({ name: "", price: "", duration_minutes: "30", buffer_minutes: "0" });
  const [reviewFilterNota, setReviewFilterNota] = useState<string>("all");
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState<Date | undefined>();
  const [overrideForm, setOverrideForm] = useState({ open_time: "08:00", close_time: "21:00", break_start: "", break_end: "", is_blocked: false, reason: "" });
  const [replicateMode, setReplicateMode] = useState(false);
  const [replicateDates, setReplicateDates] = useState<Date[]>([]);
  const [replicateSource, setReplicateSource] = useState<any>(null);
  const { businessName } = useBusinessName();
  const appearanceSettings = useAppearance();

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/admin-login"); return; }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!roles || roles.length === 0) {
        toast.error("Sem permissão de administrador.");
        navigate("/admin-login");
        return;
      }
      const userRole = roles[0].role;
      if (userRole === "super_admin") {
        setIsSuperAdmin(true);
      }
      setIsAdmin(true);
    };
    checkAdmin();
  }, [navigate]);

  useEffect(() => {
    if (businessName) setBusinessNameInput(businessName);
  }, [businessName]);

  // Fetch slot interval and cancellation settings
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("key, value")
        .in("key", ["slot_interval_minutes", "cancelamento_antecedencia"]);
      if (data) {
        data.forEach((s: any) => {
          if (s.key === "slot_interval_minutes" && s.value) setSlotIntervalInput(s.value);
          if (s.key === "cancelamento_antecedencia" && s.value) setCancelamentoAntecedencia(s.value);
        });
      }
    };
    fetchSettings();
  }, []);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["admin-appointments"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, services(name, duration_minutes, buffer_minutes)")
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: true });
      if (error) throw error;
      return data as Appointment[];
    },
  });

  const { data: scheduleConfig } = useQuery({
    queryKey: ["admin-schedule-config"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_config").select("*").order("day_of_week");
      if (error) throw error;
      return data;
    },
  });

  const { data: services } = useQuery({
    queryKey: ["admin-services"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: blockedSlots } = useQuery({
    queryKey: ["admin-blocked-slots"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_slots")
        .select("*")
        .gte("blocked_date", format(new Date(), "yyyy-MM-dd"))
        .order("blocked_date");
      if (error) throw error;
      return data;
    },
  });

  const { data: scheduleOverrides } = useQuery({
    queryKey: ["admin-schedule-overrides"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_overrides" as any)
        .select("*")
        .gte("override_date", format(new Date(), "yyyy-MM-dd"))
        .order("override_date");
      if (error) throw error;
      return data as any[];
    },
  });

  const overrideDatesSet = new Set((scheduleOverrides || []).map((o: any) => o.override_date));

  const saveOverrideMutation = useMutation({
    mutationFn: async (dates: Date[]) => {
      for (const d of dates) {
        const dateStr = format(d, "yyyy-MM-dd");
        const payload: any = {
          override_date: dateStr,
          open_time: overrideForm.open_time,
          close_time: overrideForm.close_time,
          break_start: overrideForm.break_start || null,
          break_end: overrideForm.break_end || null,
          is_blocked: overrideForm.is_blocked,
          reason: overrideForm.reason || null,
        };
        const { error } = await supabase.from("schedule_overrides" as any).upsert(payload, { onConflict: "override_date" } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-schedule-overrides"] });
      setOverrideModalOpen(false);
      setReplicateMode(false);
      setReplicateDates([]);
      toast.success("Horário especial salvo!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_overrides" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-schedule-overrides"] });
      toast.success("Exceção removida!");
    },
  });

  const { data: adminUsers, refetch: refetchAdminUsers } = useQuery({
    queryKey: ["admin-users"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "list" }),
        }
      );
      const result = await res.json();
      return result.users || [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, any> = { status };
      // Early finish: store actual end time when marked as finalizado
      if (status === "finalizado") {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        updates.actual_end_time = `${hh}:${mm}`;
      }
      // Clear actual_end_time if reverting from finalizado
      if (status !== "finalizado") {
        updates.actual_end_time = null;
      }
      const { error } = await supabase.from("appointments").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Status atualizado!");
    },
  });

  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Agendamento excluído!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("schedule_config").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-schedule-config"] });
      toast.success("Agenda atualizada!");
    },
  });

  const updateService = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("services").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      toast.success("Serviço atualizado!");
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      toast.success("Serviço excluído!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const blockDateMutation = useMutation({
    mutationFn: async () => {
      if (!blockDate) throw new Error("Selecione uma data");
      const { error } = await supabase.from("blocked_slots").insert({
        blocked_date: format(blockDate, "yyyy-MM-dd"),
        full_day: true,
        reason: blockReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blocked-slots"] });
      setBlockDate(undefined);
      setBlockReason("");
      toast.success("Data bloqueada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocked_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blocked-slots"] });
      toast.success("Bloqueio removido!");
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login");
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || newPassword.length < 6) {
      toast.error("Email e senha (mín. 6 caracteres) são obrigatórios.");
      return;
    }
    setCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-admin-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: newEmail, password: newPassword }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success(result.message);
      setNewEmail("");
      setNewPassword("");
      refetchAdminUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    }
    setCreatingUser(false);
  };

  const handleUpdatePassword = async (userId: string) => {
    if (!newUserPassword || newUserPassword.length < 6) {
      toast.error("Senha mínima de 6 caracteres.");
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "update_password", user_id: userId, password: newUserPassword }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success("Senha atualizada!");
      setEditingPasswordId(null);
      setNewUserPassword("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Excluir a conta de ${email}? Esta ação não pode ser desfeita.`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "delete", user_id: userId }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success("Usuário excluído!");
      refetchAdminUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveCancelamento = async () => {
    try {
      const { data: existing } = await supabase
        .from("business_settings")
        .select("id")
        .eq("key", "cancelamento_antecedencia")
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("business_settings" as any)
          .update({ value: cancelamentoAntecedencia } as any)
          .eq("key", "cancelamento_antecedencia");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("business_settings" as any)
          .insert({ key: "cancelamento_antecedencia", value: cancelamentoAntecedencia } as any);
        if (error) throw error;
      }
      const labels: Record<string, string> = { "15": "15 min", "30": "30 min", "60": "1 hora", "120": "2 horas", "240": "4 horas", "720": "12 horas", "1440": "24 horas" };
      toast.success(`Antecedência definida para ${labels[cancelamentoAntecedencia] || cancelamentoAntecedencia + ' min'}!`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveSlotInterval = async () => {
    try {
      const { data: existing } = await supabase
        .from("business_settings")
        .select("id")
        .eq("key", "slot_interval_minutes")
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("business_settings" as any)
          .update({ value: slotIntervalInput } as any)
          .eq("key", "slot_interval_minutes");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("business_settings" as any)
          .insert({ key: "slot_interval_minutes", value: slotIntervalInput } as any);
        if (error) throw error;
      }
      toast.success(`Intervalo atualizado para ${slotIntervalInput} minutos!`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveBusinessName = async () => {
    if (!businessNameInput.trim()) {
      toast.error("Nome do estabelecimento não pode ser vazio.");
      return;
    }
    try {
      const { error } = await supabase
        .from("business_settings" as any)
        .update({ value: businessNameInput.trim() } as any)
        .eq("key", "business_name");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["business-name"] });
      toast.success("Nome atualizado com sucesso!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Filtered appointments by date
  const filteredAppointments = filterDate
    ? appointments?.filter((a) => a.appointment_date === format(filterDate, "yyyy-MM-dd"))
    : appointments;

  const openWhatsApp = (phone: string, clientName: string, appointmentTime: string, serviceName: string) => {
    if (!phone) return;
    // 1. Limpa espaços e traços, confiando no número exato que o cliente digitou
    let cleanPhone = phone.replace(/\D/g, '');

    // 2. Garante que tem o 55 do Brasil na frente
    if (!cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }

    // 3. Monta a string limpa preservando os emojis perfeitamente
    const time = appointmentTime.slice(0, 5);
    const service = serviceName || "corte";
    const textMessage = `Ol\u00e1, ${clientName} ! Passando para confirmar seu agendamento de \uD83D\uDC87\uD83C\uDFFD\u200D\u2642\uFE0F ${service} hoje \u00e0s ${time}\u231A -> \uD83D\uDC88 \uD835\uDD2D\uD835\uDD1E\uD835\uDD2F\uD835\uDD1F\uD835\uDD22\uD835\uDD1E\uD835\uDD2F\uD835\uDD26\uD835\uDD1E \uD835\uDD07\uD835\uDD2C \uD835\uDD09\uD835\uDD1E\uD835\uDD29 \uD83D\uDC88. Te aguardamos !`;

    // 4. Codifica a URL de forma segura
    const encodedMessage = encodeURIComponent(textMessage);
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
    window.open(url, '_blank');
  };

  const { data: reviewsData } = useQuery({
    queryKey: ["admin-avaliacoes"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("avaliacoes").select("estrelas, hidden").eq("hidden", false);
      if (error) { console.error(error); return { average: 0, total: 0 }; }
      if (!data || data.length === 0) return { average: 0, total: 0 };
      const total = data.length;
      const sum = data.reduce((acc, curr) => acc + (curr.estrelas || 0), 0);
      return { average: Number((sum / total).toFixed(1)), total };
    },
  });

  // Full reviews list for super admin management
  const { data: allReviews } = useQuery({
    queryKey: ["admin-all-reviews"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avaliacoes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const toggleHideReview = useMutation({
    mutationFn: async ({ id, hidden }: { id: string; hidden: boolean }) => {
      const { error } = await supabase.from("avaliacoes").update({ hidden } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["admin-avaliacoes"] });
      queryClient.invalidateQueries({ queryKey: ["avaliacoes_resumo"] });
      toast.success("Avaliação atualizada!");
    },
  });

  const filteredReviews = allReviews?.filter((r: any) => {
    if (reviewFilterNota === "all") return true;
    if (reviewFilterNota === "low") return r.estrelas <= 2;
    if (reviewFilterNota === "high") return r.estrelas >= 4;
    return r.estrelas === Number(reviewFilterNota);
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayTotal = appointments?.filter((a) => a.appointment_date === todayStr && a.status === "finalizado").reduce((sum, a) => sum + Number(a.price), 0) || 0;
  const todayCount = appointments?.filter((a) => a.appointment_date === todayStr && a.status !== "cancelado").length || 0;
  const monthTotal = appointments?.filter((a) => a.appointment_date.startsWith(format(new Date(), "yyyy-MM")) && a.status === "finalizado").reduce((sum, a) => sum + Number(a.price), 0) || 0;
  const totalGeral = appointments?.filter((a) => a.status === "finalizado").reduce((sum, a) => sum + Number(a.price), 0) || 0;

  if (isAdmin === null) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Verificando acesso...</div>;
  }

  const tabCount = isSuperAdmin ? 6 : 4;

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">Painel Admin</h1>
            <p className="text-sm text-muted-foreground">{businessName}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")} className="gap-2 border-border bg-background hover:bg-secondary hover:text-foreground hover:border-primary active:bg-secondary text-foreground transition-colors">
              <Home className="h-4 w-4" /> Página Inicial
            </Button>
            <Button variant="outline" onClick={handleLogout} className="gap-2 border-border bg-background hover:bg-secondary hover:text-foreground active:bg-secondary text-foreground transition-colors">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className={cn("mb-6 grid w-full", isSuperAdmin ? "grid-cols-8" : "grid-cols-5")}>
            <TabsTrigger value="dashboard">Agendamentos</TabsTrigger>
            <TabsTrigger value="quicksale" className="gap-1"><Zap className="h-3.5 w-3.5" />Encaixe</TabsTrigger>
            <TabsTrigger value="schedule">Agenda</TabsTrigger>
            <TabsTrigger value="services">Serviços</TabsTrigger>
            {isSuperAdmin && <TabsTrigger value="reviews" className="gap-1"><Star className="h-3.5 w-3.5" />Avaliações</TabsTrigger>}
            {isSuperAdmin && <TabsTrigger value="team">Equipe</TabsTrigger>}
            {isSuperAdmin && <TabsTrigger value="appearance">Aparência</TabsTrigger>}
            {isSuperAdmin && <TabsTrigger value="settings">Config</TabsTrigger>}
            {!isSuperAdmin && <TabsTrigger value="team" disabled>Equipe</TabsTrigger>}
          </TabsList>

          {/* ─── TAB: Dashboard ─── */}
          <TabsContent value="dashboard">
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 pt-6">
                  <CalendarIcon className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{todayCount}</p>
                    <p className="text-xs text-muted-foreground">Agendamentos hoje</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 pt-6">
                  <DollarSign className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">R$ {todayTotal.toFixed(2).replace(".", ",")}</p>
                    <p className="text-xs text-muted-foreground">Faturamento hoje</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 pt-6">
                  <DollarSign className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">R$ {monthTotal.toFixed(2).replace(".", ",")}</p>
                    <p className="text-xs text-muted-foreground">Este mês</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 pt-6">
                  <DollarSign className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">R$ {totalGeral.toFixed(2).replace(".", ",")}</p>
                    <p className="text-xs text-muted-foreground">Total geral</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 pt-6">
                  <Star className="h-8 w-8 fill-yellow-500 text-yellow-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{reviewsData?.average || "—"}</p>
                    <p className="text-xs text-muted-foreground">Média ({reviewsData?.total || 0} aval.)</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border bg-card">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-primary">Agendamentos</CardTitle>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("gap-2", filterDate && "border-primary text-primary")}>
                          <CalendarIcon className="h-4 w-4" />
                          {filterDate ? format(filterDate, "dd/MM/yyyy") : "Filtrar por data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={filterDate}
                          onSelect={setFilterDate}
                          locale={ptBR}
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    {filterDate && (
                      <Button variant="ghost" size="sm" onClick={() => setFilterDate(undefined)} className="gap-1 text-muted-foreground">
                        <X className="h-4 w-4" /> Limpar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Carregando...</p>
                ) : filteredAppointments && filteredAppointments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nenhum agendamento {filterDate ? "nesta data" : "encontrado"}.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border">
                          <TableHead className="text-primary">Data</TableHead>
                          <TableHead className="text-primary">Hora</TableHead>
                          <TableHead className="text-primary">Cliente</TableHead>
                          <TableHead className="text-primary">Telefone</TableHead>
                          <TableHead className="text-primary">Serviço</TableHead>
                          <TableHead className="text-primary">Valor</TableHead>
                          <TableHead className="text-primary">Pgto</TableHead>
                          <TableHead className="text-primary">Status</TableHead>
                          <TableHead className="text-primary w-24"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAppointments?.map((a) => (
                          <TableRow key={a.id} className={cn("border-border transition-opacity", a.status === "cancelado" && "opacity-40")}>
                            <TableCell className="text-foreground">{format(new Date(a.appointment_date + "T12:00:00"), "dd/MM")}</TableCell>
                            <TableCell className="text-foreground">{a.appointment_time.slice(0, 5)}</TableCell>
                            <TableCell className="text-foreground">{a.client_name}</TableCell>
                            <TableCell className="text-foreground">{a.client_phone}</TableCell>
                            <TableCell className="text-foreground">
                              <div>{(a as any).service_description || a.services?.name}</div>
                              <div className="text-xs text-muted-foreground">{a.services?.duration_minutes ?? 30} min</div>
                            </TableCell>
                            <TableCell className="text-primary font-semibold">R$ {Number(a.price).toFixed(2).replace(".", ",")}</TableCell>
                            <TableCell className="text-foreground capitalize">{a.payment_method}</TableCell>
                            <TableCell>
                              <Select value={a.status} onValueChange={(v) => updateStatus.mutate({ id: a.id, status: v })}>
                                <SelectTrigger className="w-32 border-border">
                                  <SelectValue>
                                    <Badge className={statusColors[a.status] || ""}>{a.status}</Badge>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">Pendente</SelectItem>
                                  <SelectItem value="confirmado">Confirmado</SelectItem>
                                  <SelectItem value="finalizado">✅ Concluído</SelectItem>
                                  <SelectItem value="cancelado">Cancelado</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={a.status === "cancelado"}
                                className={cn("h-8 w-8", a.status === "cancelado" ? "text-muted-foreground/40 cursor-default" : "text-green-500 hover:text-green-400")}
                                title={a.status === "cancelado" ? "Atendimento cancelado" : "Enviar lembrete via WhatsApp"}
                                onClick={() => a.status !== "cancelado" && openWhatsApp(a.client_phone, a.client_name, a.appointment_time, a.services?.name || "corte")}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingAppointment(a)}
                                className="h-8 w-8 text-primary hover:text-primary/80"
                                title="Editar serviços"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm("Excluir este agendamento?")) {
                                    deleteAppointment.mutate(a.id);
                                  }
                                }}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── TAB: Venda Rápida ─── */}
          <TabsContent value="quicksale">
            <QuickSale />
          </TabsContent>

          {/* ─── TAB: Schedule ─── */}
          <TabsContent value="schedule">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Settings className="h-5 w-5" /> Turnos de Trabalho
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {scheduleConfig?.map((day) => (
                    <div key={day.id} className="rounded-lg border border-border bg-secondary p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={day.is_open}
                          onCheckedChange={(checked) =>
                            updateSchedule.mutate({ id: day.id, updates: { is_open: checked } })
                          }
                        />
                        <span className="w-24 text-sm font-medium text-foreground">{DAY_NAMES[day.day_of_week]}</span>
                        {day.is_open && (
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={day.open_time.slice(0, 5)}
                              onChange={(e) =>
                                updateSchedule.mutate({ id: day.id, updates: { open_time: e.target.value } })
                              }
                              className="w-28 border border-primary/40 bg-background text-sm text-white"
                            />
                            <span className="text-muted-foreground">até</span>
                            <Input
                              type="time"
                              value={day.close_time.slice(0, 5)}
                              onChange={(e) =>
                                updateSchedule.mutate({ id: day.id, updates: { close_time: e.target.value } })
                              }
                              className="w-28 border border-primary/40 bg-background text-sm text-white"
                            />
                          </div>
                        )}
                        {!day.is_open && <span className="text-sm text-muted-foreground">Fechado</span>}
                      </div>
                      {day.is_open && (
                        <div className="flex items-center gap-2 pl-12">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">Pausa:</span>
                          <Input
                            type="time"
                            value={(day as any).break_start?.slice(0, 5) || ""}
                            onChange={(e) =>
                              updateSchedule.mutate({ id: day.id, updates: { break_start: e.target.value || null } })
                            }
                            placeholder="Início"
                              className="w-28 border border-primary/40 bg-background text-sm text-white"
                            />
                          <span className="text-muted-foreground text-xs">até</span>
                          <Input
                            type="time"
                            value={(day as any).break_end?.slice(0, 5) || ""}
                            onChange={(e) =>
                              updateSchedule.mutate({ id: day.id, updates: { break_end: e.target.value || null } })
                            }
                            placeholder="Fim"
                              className="w-28 border border-primary/40 bg-background text-sm text-white"
                            />
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Ban className="h-5 w-5" /> Bloquear Data / Horário Especial
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-sm text-muted-foreground">Bloqueie datas ou defina horários diferentes para dias específicos.</p>
                  <div className="flex justify-center mb-4">
                    <Calendar
                      mode="single"
                      selected={blockDate}
                      onSelect={setBlockDate}
                      locale={ptBR}
                      className="pointer-events-auto"
                      modifiers={{ override: (date: Date) => overrideDatesSet.has(format(date, "yyyy-MM-dd")) }}
                      modifiersStyles={{ override: { border: "2px solid hsl(43 74% 49%)", borderRadius: "8px" } }}
                    />
                  </div>
                  {blockDate && (
                    <div className="space-y-3">
                      <Input
                        placeholder="Motivo (opcional)"
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 gap-2"
                          onClick={() => blockDateMutation.mutate()}
                          disabled={blockDateMutation.isPending}
                        >
                          <Ban className="h-4 w-4" />
                          Bloquear {format(blockDate, "dd/MM")}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 gap-2 border-primary text-primary hover:bg-primary/10"
                          onClick={() => {
                            setOverrideDate(blockDate);
                            const existing = (scheduleOverrides || []).find((o: any) => o.override_date === format(blockDate, "yyyy-MM-dd"));
                            if (existing) {
                              setOverrideForm({
                                open_time: existing.open_time?.slice(0, 5) || "08:00",
                                close_time: existing.close_time?.slice(0, 5) || "21:00",
                                break_start: existing.break_start?.slice(0, 5) || "",
                                break_end: existing.break_end?.slice(0, 5) || "",
                                is_blocked: existing.is_blocked || false,
                                reason: existing.reason || "",
                              });
                            } else {
                              const dow = getDay(blockDate);
                              const dc = scheduleConfig?.find((c) => c.day_of_week === dow);
                              setOverrideForm({
                                open_time: dc?.open_time?.slice(0, 5) || "08:00",
                                close_time: dc?.close_time?.slice(0, 5) || "21:00",
                                break_start: (dc as any)?.break_start?.slice(0, 5) || "",
                                break_end: (dc as any)?.break_end?.slice(0, 5) || "",
                                is_blocked: false,
                                reason: "",
                              });
                            }
                            setOverrideModalOpen(true);
                          }}
                        >
                          <Clock className="h-4 w-4" />
                          Editar Horário
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Overrides list */}
                  {scheduleOverrides && scheduleOverrides.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-primary">Horários Especiais:</p>
                      {scheduleOverrides.map((o: any) => (
                        <div key={o.id} className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              {format(new Date(o.override_date + "T12:00:00"), "dd/MM/yyyy")}
                            </span>
                            {o.is_blocked ? (
                              <span className="ml-2 text-xs text-destructive">(Bloqueado)</span>
                            ) : (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {o.open_time?.slice(0, 5)} - {o.close_time?.slice(0, 5)}
                                {o.break_start && ` | Pausa: ${o.break_start?.slice(0, 5)}-${o.break_end?.slice(0, 5)}`}
                              </span>
                            )}
                            {o.reason && <span className="ml-2 text-xs text-muted-foreground">({o.reason})</span>}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary/80"
                              title="Replicar para outras datas"
                              onClick={() => {
                                setReplicateSource(o);
                                setOverrideForm({
                                  open_time: o.open_time?.slice(0, 5) || "08:00",
                                  close_time: o.close_time?.slice(0, 5) || "21:00",
                                  break_start: o.break_start?.slice(0, 5) || "",
                                  break_end: o.break_end?.slice(0, 5) || "",
                                  is_blocked: o.is_blocked || false,
                                  reason: o.reason || "",
                                });
                                setReplicateDates([]);
                                setReplicateMode(true);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteOverrideMutation.mutate(o.id)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {blockedSlots && blockedSlots.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-foreground">Datas bloqueadas:</p>
                      {blockedSlots.map((b) => (
                        <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2">
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              {format(new Date(b.blocked_date + "T12:00:00"), "dd/MM/yyyy")}
                            </span>
                            {b.reason && <span className="ml-2 text-xs text-muted-foreground">({b.reason})</span>}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteBlock.mutate(b.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Override Modal */}
              {overrideModalOpen && overrideDate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOverrideModalOpen(false)}>
                  <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <h3 className="mb-4 text-lg font-bold text-primary">
                      Horário Especial — {format(overrideDate, "dd/MM/yyyy")}
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Switch checked={overrideForm.is_blocked} onCheckedChange={(v) => setOverrideForm((f) => ({ ...f, is_blocked: v }))} />
                        <span className="text-sm text-white font-medium">Bloquear dia inteiro</span>
                      </div>
                      {!overrideForm.is_blocked && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1 block text-sm text-white">Abertura</label>
                              <Input type="time" value={overrideForm.open_time} onChange={(e) => setOverrideForm((f) => ({ ...f, open_time: e.target.value }))} className="border-primary/40 bg-secondary text-white" />
                            </div>
                            <div>
                              <label className="mb-1 block text-sm text-white">Fechamento</label>
                              <Input type="time" value={overrideForm.close_time} onChange={(e) => setOverrideForm((f) => ({ ...f, close_time: e.target.value }))} className="border-primary/40 bg-secondary text-white" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1 block text-sm text-white">Início Pausa</label>
                              <Input type="time" value={overrideForm.break_start} onChange={(e) => setOverrideForm((f) => ({ ...f, break_start: e.target.value }))} className="border-primary/40 bg-secondary text-white" />
                            </div>
                            <div>
                              <label className="mb-1 block text-sm text-white">Fim Pausa</label>
                              <Input type="time" value={overrideForm.break_end} onChange={(e) => setOverrideForm((f) => ({ ...f, break_end: e.target.value }))} className="border-primary/40 bg-secondary text-white" />
                            </div>
                          </div>
                        </>
                      )}
                      <div>
                        <label className="mb-1 block text-sm text-white">Motivo (opcional)</label>
                        <Input value={overrideForm.reason} onChange={(e) => setOverrideForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Ex: Feriado, evento especial" className="border-border bg-secondary text-white" />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button className="flex-1" onClick={() => saveOverrideMutation.mutate([overrideDate])} disabled={saveOverrideMutation.isPending}>
                          Salvar
                        </Button>
                        <Button variant="outline" onClick={() => setOverrideModalOpen(false)}>Cancelar</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Replicate Modal */}
              {replicateMode && replicateSource && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setReplicateMode(false)}>
                  <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <h3 className="mb-2 text-lg font-bold text-primary">Replicar Horário Especial</h3>
                    <p className="mb-3 text-sm text-white">
                      Config: {replicateSource.open_time?.slice(0, 5)} - {replicateSource.close_time?.slice(0, 5)}
                      {replicateSource.break_start && ` | Pausa: ${replicateSource.break_start?.slice(0, 5)}-${replicateSource.break_end?.slice(0, 5)}`}
                    </p>
                    <p className="mb-2 text-sm text-white">Selecione as datas para aplicar:</p>
                    <div className="flex justify-center mb-4">
                      <Calendar
                        mode="multiple"
                        selected={replicateDates}
                        onSelect={(dates) => setReplicateDates(dates || [])}
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" disabled={replicateDates.length === 0 || saveOverrideMutation.isPending} onClick={() => saveOverrideMutation.mutate(replicateDates)}>
                        Aplicar em {replicateDates.length} data(s)
                      </Button>
                      <Button variant="outline" onClick={() => setReplicateMode(false)}>Cancelar</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── TAB: Services ─── */}
          <TabsContent value="services">
            <Card className="border-border bg-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Clock className="h-5 w-5" /> Serviços, Duração e Intervalo
                  </CardTitle>
                  <Button
                    onClick={() => {
                      setServiceModalOpen(true);
                      setEditingService(null);
                      setServiceForm({ name: "", price: "", duration_minutes: "30", buffer_minutes: "0" });
                    }}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" /> Novo Serviço
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Defina o tempo de cada serviço e o intervalo (buffer) entre atendimentos.
                </p>
                <div className="space-y-3">
                  {services?.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary p-4">
                      <div className="flex-1 min-w-[120px]">
                        <p className="font-medium text-foreground">{s.name}</p>
                        <p className="text-sm text-primary font-semibold">
                          R$ {Number(s.price).toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">Duração:</label>
                        <Select
                          value={String((s as any).duration_minutes ?? 30)}
                          onValueChange={(v) =>
                            updateService.mutate({ id: s.id, updates: { duration_minutes: Number(v) } })
                          }
                        >
                          <SelectTrigger className="w-24 border-border bg-background text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[10, 15, 20, 30, 40, 45, 50, 60, 90, 120].map((m) => (
                              <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">Intervalo:</label>
                        <Select
                          value={String((s as any).buffer_minutes ?? 5)}
                          onValueChange={(v) =>
                            updateService.mutate({ id: s.id, updates: { buffer_minutes: Number(v) } })
                          }
                        >
                          <SelectTrigger className="w-24 border-border bg-background text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[0, 5, 10, 15, 20].map((m) => (
                              <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={s.active}
                          onCheckedChange={(checked) =>
                            updateService.mutate({ id: s.id, updates: { active: checked } })
                          }
                        />
                        <span className="text-xs text-muted-foreground">{s.active ? "Ativo" : "Inativo"}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-primary/80"
                        title="Editar serviço"
                        onClick={() => {
                          setEditingService(s);
                          setServiceForm({
                            name: s.name,
                            price: String(s.price),
                            duration_minutes: String(s.duration_minutes),
                            buffer_minutes: String(s.buffer_minutes),
                          });
                          setServiceModalOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Excluir serviço"
                        onClick={() => {
                          if (confirm(`Excluir o serviço "${s.name}"?`)) {
                            deleteServiceMutation.mutate(s.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Service Add/Edit Modal */}
            {serviceModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setServiceModalOpen(false)}>
                <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <h3 className="mb-4 text-lg font-bold text-primary">
                    {editingService ? "Editar Serviço" : "Novo Serviço"}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">Nome</label>
                      <Input
                        value={serviceForm.name}
                        onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Ex: Corte + Barba"
                        className="border-border bg-secondary text-foreground"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">Preço (R$)</label>
                      <Input
                        value={serviceForm.price}
                        onChange={(e) => setServiceForm((f) => ({ ...f, price: e.target.value }))}
                        placeholder="35.00"
                        className="border-border bg-secondary text-foreground"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-sm text-muted-foreground">Duração (min)</label>
                        <Select value={serviceForm.duration_minutes} onValueChange={(v) => setServiceForm((f) => ({ ...f, duration_minutes: v }))}>
                          <SelectTrigger className="border-border bg-secondary"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[10, 15, 20, 30, 40, 45, 50, 60, 90, 120].map((m) => (
                              <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-muted-foreground">Intervalo (min)</label>
                        <Select value={serviceForm.buffer_minutes} onValueChange={(v) => setServiceForm((f) => ({ ...f, buffer_minutes: v }))}>
                          <SelectTrigger className="border-border bg-secondary"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[0, 5, 10, 15, 20].map((m) => (
                              <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        className="flex-1"
                        onClick={async () => {
                          const price = parseFloat(serviceForm.price.replace(",", "."));
                          if (!serviceForm.name.trim() || isNaN(price)) {
                            toast.error("Preencha nome e preço válido.");
                            return;
                          }
                          const payload = {
                            name: serviceForm.name.trim(),
                            price,
                            duration_minutes: Number(serviceForm.duration_minutes),
                            buffer_minutes: Number(serviceForm.buffer_minutes),
                          };
                          if (editingService) {
                            updateService.mutate({ id: editingService.id, updates: payload });
                          } else {
                            const maxOrder = services?.reduce((max, s) => Math.max(max, s.sort_order), 0) || 0;
                            const { error } = await supabase.from("services").insert({ ...payload, sort_order: maxOrder + 1 } as any);
                            if (error) { toast.error(error.message); return; }
                            queryClient.invalidateQueries({ queryKey: ["admin-services"] });
                            toast.success("Serviço criado!");
                          }
                          setServiceModalOpen(false);
                        }}
                      >
                        {editingService ? "Salvar" : "Criar"}
                      </Button>
                      <Button variant="outline" onClick={() => setServiceModalOpen(false)}>Cancelar</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ─── TAB: Avaliações (Super Admin only) ─── */}
          {isSuperAdmin && (
            <TabsContent value="reviews">
              <Card className="border-border bg-card">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="flex items-center gap-2 text-primary">
                      <Star className="h-5 w-5" /> Gerenciar Avaliações
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Select value={reviewFilterNota} onValueChange={setReviewFilterNota}>
                        <SelectTrigger className="w-40 border-border">
                          <SelectValue placeholder="Filtrar por nota" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as notas</SelectItem>
                          <SelectItem value="low">⭐ 1-2 estrelas</SelectItem>
                          <SelectItem value="high">⭐ 4-5 estrelas</SelectItem>
                          <SelectItem value="1">1 estrela</SelectItem>
                          <SelectItem value="2">2 estrelas</SelectItem>
                          <SelectItem value="3">3 estrelas</SelectItem>
                          <SelectItem value="4">4 estrelas</SelectItem>
                          <SelectItem value="5">5 estrelas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!filteredReviews || filteredReviews.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Nenhuma avaliação encontrada.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border">
                            <TableHead className="text-primary">Cliente</TableHead>
                            <TableHead className="text-primary">Data</TableHead>
                            <TableHead className="text-primary">Nota</TableHead>
                            <TableHead className="text-primary">Status</TableHead>
                            <TableHead className="text-primary w-24">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredReviews.map((r: any) => (
                            <TableRow key={r.id} className={cn("border-border", r.hidden && "opacity-40")}>
                              <TableCell className="text-foreground font-medium">{r.nome_cliente}</TableCell>
                              <TableCell className="text-foreground">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                      key={i}
                                      className={cn(
                                        "h-4 w-4",
                                        i < r.estrelas ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"
                                      )}
                                    />
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={r.hidden ? "bg-red-600/20 text-red-400 border-red-600/30" : "bg-green-600/20 text-green-400 border-green-600/30"}>
                                  {r.hidden ? "Oculta" : "Visível"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn("gap-1", r.hidden ? "text-green-400 hover:text-green-300" : "text-red-400 hover:text-red-300")}
                                  onClick={() => toggleHideReview.mutate({ id: r.id, hidden: !r.hidden })}
                                  disabled={toggleHideReview.isPending}
                                >
                                  {r.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                  {r.hidden ? "Mostrar" : "Ocultar"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Avaliações ocultas não contam na média pública exibida no site.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ─── TAB: Team (Super Admin only) ─── */}
          <TabsContent value="team">
            {!isSuperAdmin ? (
              <Card className="border-border bg-card">
                <CardContent className="py-12 text-center">
                  <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">Apenas o Super Admin pode gerenciar a equipe.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Create user form */}
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary">
                      <UserPlus className="h-5 w-5" /> Cadastrar Barbeiro
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Cadastre um novo barbeiro que terá acesso ao painel administrativo.
                    </p>
                    <form onSubmit={handleCreateUser} className="space-y-4 max-w-sm">
                      <div>
                        <label className="mb-1 block text-sm text-muted-foreground">Email do barbeiro</label>
                        <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="barbeiro@email.com" required />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-muted-foreground">Senha provisória (mín. 6 caracteres)</label>
                        <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••" required minLength={6} />
                      </div>
                      <Button type="submit" disabled={creatingUser} className="gap-2">
                        <UserPlus className="h-4 w-4" />
                        {creatingUser ? "Criando..." : "Criar Conta de Barbeiro"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* List admin users */}
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary">
                      <Settings className="h-5 w-5" /> Barbeiros Cadastrados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!adminUsers || adminUsers.length === 0 ? (
                      <p className="text-muted-foreground text-sm">Nenhum barbeiro cadastrado ainda.</p>
                    ) : (
                      <div className="space-y-3">
                        {adminUsers.map((u: any) => (
                          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary p-4">
                            <div className="flex-1 min-w-[150px]">
                              <p className="font-medium text-foreground">{u.email}</p>
                              <p className="text-xs text-muted-foreground">
                                Criado em {format(new Date(u.created_at), "dd/MM/yyyy")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {editingPasswordId === u.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="password"
                                    placeholder="Nova senha"
                                    value={newUserPassword}
                                    onChange={(e) => setNewUserPassword(e.target.value)}
                                    className="w-36"
                                    minLength={6}
                                  />
                                  <Button size="sm" onClick={() => handleUpdatePassword(u.id)}>Salvar</Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setEditingPasswordId(null); setNewUserPassword(""); }}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button variant="outline" size="sm" onClick={() => setEditingPasswordId(u.id)} className="gap-1">
                                  <KeyRound className="h-3 w-3" /> Senha
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ─── TAB: Aparência (Super Admin only) ─── */}
          {isSuperAdmin && (
            <TabsContent value="appearance">
              <AppearanceTab settings={appearanceSettings} />
            </TabsContent>
          )}

          {/* ─── TAB: Settings (Super Admin only) ─── */}
          {isSuperAdmin && (
            <TabsContent value="settings">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Shield className="h-5 w-5" /> Configurações Globais
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Altere o nome do estabelecimento e configurações de agendamento.
                  </p>
                  <div className="max-w-sm space-y-6">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Nome do Estabelecimento</label>
                      <Input
                        value={businessNameInput}
                        onChange={(e) => setBusinessNameInput(e.target.value)}
                        placeholder="Ex: Barbearia Premium"
                      />
                    </div>
                    <Button onClick={handleSaveBusinessName} className="gap-2">
                      <Settings className="h-4 w-4" />
                      Salvar Nome
                    </Button>

                    <div className="border-t border-border pt-4">
                      <label className="mb-1 block text-sm font-medium text-foreground">Intervalo de Agendamento (minutos)</label>
                      <p className="mb-2 text-xs text-muted-foreground">Define o pulo entre horários na grade do cliente (ex: 30, 45, 60).</p>
                      <div className="flex gap-2">
                        <Select
                          value={slotIntervalInput}
                          onValueChange={(v) => setSlotIntervalInput(v)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 min</SelectItem>
                            <SelectItem value="30">30 min</SelectItem>
                            <SelectItem value="45">45 min</SelectItem>
                            <SelectItem value="60">60 min</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button onClick={handleSaveSlotInterval} variant="outline" className="gap-2">
                          <Clock className="h-4 w-4" /> Salvar Intervalo
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-border pt-4">
                      <label className="mb-1 block text-sm font-medium text-foreground">Antecedência para Cancelamento</label>
                      <p className="mb-2 text-xs text-muted-foreground">Tempo mínimo antes do horário para o cliente cancelar. Cancelamentos feitos em até 5 min após o agendamento são sempre permitidos.</p>
                      <div className="flex gap-2">
                        <Select
                          value={cancelamentoAntecedencia}
                          onValueChange={(v) => setCancelamentoAntecedencia(v)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 min</SelectItem>
                            <SelectItem value="30">30 min</SelectItem>
                            <SelectItem value="60">1 hora</SelectItem>
                            <SelectItem value="120">2 horas</SelectItem>
                            <SelectItem value="240">4 horas</SelectItem>
                            <SelectItem value="720">12 horas</SelectItem>
                            <SelectItem value="1440">24 horas</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button onClick={handleSaveCancelamento} variant="outline" className="gap-2">
                          <Clock className="h-4 w-4" /> Salvar
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-border pt-4">
                      <ImageUpload
                        label="Logo da Barbearia"
                        hint="Envie a logo que aparecerá na página inicial. Recomendado: PNG com fundo transparente."
                        currentUrl={appearanceSettings?.logo_image || ""}
                        storagePath="logo"
                        previewClass="h-24 w-auto object-contain mx-auto"
                        onUploaded={async (url) => {
                          try {
                            const { data: existing } = await supabase.from("business_settings").select("id").eq("key", "logo_image").maybeSingle();
                            if (existing) {
                              await supabase.from("business_settings" as any).update({ value: url } as any).eq("key", "logo_image");
                            } else {
                              await supabase.from("business_settings" as any).insert({ key: "logo_image", value: url } as any);
                            }
                            queryClient.invalidateQueries({ queryKey: ["appearance-settings"] });
                          } catch (err: any) { toast.error(err.message); }
                        }}
                      />
                    </div>

                    <div className="border-t border-border pt-4">
                      <ImageUpload
                        label="Imagem de Fundo (Banner)"
                        hint="Envie a imagem de fundo do site. Recomendado: imagem escura, paisagem (1920×1080)."
                        currentUrl={appearanceSettings?.background_image || ""}
                        storagePath="background"
                        onUploaded={async (url) => {
                          try {
                            const { data: existing } = await supabase.from("business_settings").select("id").eq("key", "background_image").maybeSingle();
                            if (existing) {
                              await supabase.from("business_settings" as any).update({ value: url } as any).eq("key", "background_image");
                            } else {
                              await supabase.from("business_settings" as any).insert({ key: "background_image", value: url } as any);
                            }
                            queryClient.invalidateQueries({ queryKey: ["appearance-settings"] });
                          } catch (err: any) { toast.error(err.message); }
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <EditAppointmentModal
        open={!!editingAppointment}
        onOpenChange={(open) => { if (!open) setEditingAppointment(null); }}
        appointment={editingAppointment}
      />
    </main>
  );
}
