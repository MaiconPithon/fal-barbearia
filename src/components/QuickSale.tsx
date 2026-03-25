import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart, CheckCircle, Search, CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Convert "HH:MM" to minutes
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

interface CartItem {
  name: string;
  price: number;
  fromCatalog: boolean;
  serviceId?: string;
}

export function QuickSale() {
  const queryClient = useQueryClient();
  const [clientName, setClientName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"finalizado" | "pendente">("finalizado");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHour, setSelectedHour] = useState(String(new Date().getHours()).padStart(2, "0"));
  const [selectedMinute, setSelectedMinute] = useState(String(new Date().getMinutes()).padStart(2, "0"));

  const { data: services } = useQuery({
    queryKey: ["quicksale-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const filteredServices = services?.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const total = cart.reduce((sum, item) => sum + item.price, 0);

  const addFromCatalog = (service: { id: string; name: string; price: number }) => {
    setCart((prev) => [...prev, { name: service.name, price: Number(service.price), fromCatalog: true, serviceId: service.id }]);
    setSearchTerm("");
  };

  const addCustom = () => {
    const price = parseFloat(customPrice.replace(",", "."));
    if (!customName.trim() || isNaN(price) || price <= 0) {
      toast.error("Preencha nome e valor válido.");
      return;
    }
    setCart((prev) => [...prev, { name: customName.trim(), price, fromCatalog: false }]);
    setCustomName("");
    setCustomPrice("");
  };

  const removeItem = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setClientName("");
    setCart([]);
    setPaymentStatus("finalizado");
    setSelectedDate(new Date());
    const now = new Date();
    setSelectedHour(String(now.getHours()).padStart(2, "0"));
    setSelectedMinute(String(now.getMinutes()).padStart(2, "0"));
  };

  const handleFinalize = async () => {
    if (!clientName.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Adicione pelo menos um serviço.");
      return;
    }

    setSubmitting(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const timeStr = `${selectedHour}:${selectedMinute}`;

      // Calculate total duration from catalog services in cart
      const totalDuration = cart.reduce((sum, item) => {
        if (item.serviceId) {
          const svc = services?.find((s) => s.id === item.serviceId);
          return sum + (svc?.duration_minutes || 30);
        }
        return sum + 30; // default 30 min for custom items
      }, 0);

      const startMinutes = parseInt(selectedHour) * 60 + parseInt(selectedMinute);
      const endMinutes = startMinutes + totalDuration;

      // Check for overlapping appointments (time range collision)
      const { data: existingAppts, error: checkError } = await supabase
        .from("appointments")
        .select("appointment_time, service_id, actual_end_time, services(duration_minutes, buffer_minutes)")
        .eq("appointment_date", dateStr)
        .in("status", ["pendente", "confirmado"]);
      if (checkError) throw checkError;

      let hasOverlap = false;
      let overlapEndTime = "";
      for (const appt of existingAppts || []) {
        const aStart = toMin(appt.appointment_time.slice(0, 5));
        let aEnd: number;
        if (appt.actual_end_time) {
          aEnd = toMin(appt.actual_end_time.slice(0, 5));
        } else {
          const dur = (appt as any).services?.duration_minutes ?? 30;
          const buf = (appt as any).services?.buffer_minutes ?? 0;
          aEnd = aStart + dur + buf;
        }
        if (startMinutes < aEnd && endMinutes > aStart) {
          hasOverlap = true;
          const h = String(Math.floor(aEnd / 60) % 24).padStart(2, "0");
          const m = String(aEnd % 60).padStart(2, "0");
          overlapEndTime = `${h}:${m}`;
          break;
        }
      }

      if (hasOverlap) {
        toast.error(`Este período já está ocupado por outro serviço. Escolha um horário após as ${overlapEndTime}.`);
        setSubmitting(false);
        return;
      }
      
      const description = cart.map((c) => c.name).join(" + ");
      const serviceId = cart.find((c) => c.serviceId)?.serviceId || services?.[0]?.id;

      if (!serviceId) {
        toast.error("Nenhum serviço cadastrado no sistema.");
        setSubmitting(false);
        return;
      }

      const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const endM = String(endMinutes % 60).padStart(2, "0");

      const { error } = await supabase.from("appointments").insert({
        client_name: clientName.trim(),
        client_phone: "",
        appointment_date: dateStr,
        appointment_time: timeStr,
        service_id: serviceId,
        service_description: description,
        price: total,
        status: paymentStatus as any,
        payment_method: "dinheiro" as any,
        actual_end_time: null,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      toast.success("✅ Atendimento registrado com sucesso!");
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar atendimento.");
    }
    setSubmitting(false);
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  return (
    <div className="space-y-6">
      {/* Client Name */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Nome do Cliente</label>
          <Input
            placeholder="Ex: João Silva"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="text-lg border-border bg-secondary"
          />
        </CardContent>
      </Card>

      {/* Date & Time + Payment Status */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6 space-y-4">
          {/* Date picker */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Data e Hora do Atendimento</label>
            <div className="flex gap-2 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal border-border bg-secondary")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && setSelectedDate(d)}
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              {/* Time selectors */}
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedHour} onValueChange={setSelectedHour}>
                  <SelectTrigger className="w-[72px] border-border bg-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground font-bold">:</span>
                <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                  <SelectTrigger className="w-[72px] border-border bg-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {minutes.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Status do Pagamento</label>
            <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as "finalizado" | "pendente")}>
              <SelectTrigger className="w-[200px] border-border bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="finalizado">✅ Pago</SelectItem>
                <SelectItem value="pendente">⏳ Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Service Search */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6 space-y-4">
          <label className="mb-1 block text-sm font-medium text-muted-foreground">Buscar Serviço do Catálogo</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar serviço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-border bg-secondary"
            />
          </div>
          {searchTerm && filteredServices && filteredServices.length > 0 && (
            <div className="rounded-lg border border-border bg-secondary/50 max-h-48 overflow-y-auto">
              {filteredServices.map((s) => (
                <button
                  key={s.id}
                  onClick={() => addFromCatalog(s)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-primary/10 transition-colors border-b border-border last:border-0"
                >
                   <span className="text-white">{s.name}</span>
                  <span className="font-semibold text-white">
                    R$ {Number(s.price).toFixed(2).replace(".", ",")}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Custom service */}
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Serviço Adicional (livre)</label>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do serviço"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="flex-1 border-border bg-secondary"
              />
              <Input
                placeholder="Valor"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="w-28 border-border bg-secondary"
              />
              <Button type="button" size="icon" variant="outline" onClick={addCustom}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cart */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Carrinho de Serviços</span>
          </div>

          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum serviço adicionado.</p>
          ) : (
            <div className="space-y-2">
              {cart.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary px-4 py-3"
                >
                  <span className="text-sm text-foreground">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-primary">
                      R$ {item.price.toFixed(2).replace(".", ",")}
                    </span>
                    <button
                      onClick={() => removeItem(i)}
                      className="text-destructive hover:text-destructive/80 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-lg font-bold text-foreground">Total a Pagar</span>
            <span className="text-2xl font-bold text-primary">
              R$ {total.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Finalize */}
      <Button
        className="w-full gap-2 py-6 text-base font-bold uppercase tracking-wider"
        onClick={handleFinalize}
        disabled={submitting || cart.length === 0 || !clientName.trim()}
      >
        <CheckCircle className="h-5 w-5" />
        {submitting ? "Registrando..." : "ADICIONAR ENCAIXE NA AGENDA"}
      </Button>
    </div>
  );
}
