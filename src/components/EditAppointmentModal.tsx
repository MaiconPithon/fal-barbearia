import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

interface EditAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: {
    id: string;
    price: number;
    service_id: string;
    services: { name: string } | null;
    service_description?: string | null;
  } | null;
}

interface CustomItem {
  name: string;
  price: number;
}

export function EditAppointmentModal({ open, onOpenChange, appointment }: EditAppointmentModalProps) {
  const queryClient = useQueryClient();
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  const { data: services } = useQuery({
    queryKey: ["edit-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (appointment && open && services) {
      const savedDescription = appointment.service_description || appointment.services?.name || "";
      const savedPrice = Number(appointment.price);
      const parts = savedDescription.split(" + ").map((p) => p.trim()).filter(Boolean);

      // Match parts against catalog services by name
      const matchedIds = new Set<string>();
      const unmatchedNames: string[] = [];
      for (const part of parts) {
        const found = services.find((s) => s.name === part);
        if (found) {
          matchedIds.add(found.id);
        } else {
          unmatchedNames.push(part);
        }
      }

      setSelectedServiceIds(matchedIds);

      // Calculate custom items prices from remainder
      const catalogTotal = services.filter((s) => matchedIds.has(s.id)).reduce((sum, s) => sum + Number(s.price), 0);
      const remainder = Math.max(0, savedPrice - catalogTotal);

      if (unmatchedNames.length > 0) {
        const perItem = Math.round((remainder / unmatchedNames.length) * 100) / 100;
        setCustomItems(unmatchedNames.map((name, i) => ({
          name,
          price: i === unmatchedNames.length - 1
            ? Math.round((remainder - perItem * (unmatchedNames.length - 1)) * 100) / 100
            : perItem,
        })));
      } else {
        setCustomItems([]);
      }

      setCustomName("");
      setCustomPrice("");
    }
  }, [appointment, open, services]);

  const selectedServices = services?.filter((s) => selectedServiceIds.has(s.id)) || [];
  const totalFromServices = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalFromCustom = customItems.reduce((sum, c) => sum + c.price, 0);
  const grandTotal = totalFromServices + totalFromCustom;

  // Build description string
  const serviceNames = selectedServices.map((s) => s.name);
  const customNames = customItems.map((c) => c.name);
  const fullDescription = [...serviceNames, ...customNames].join(" + ");

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("appointments")
        .update({
          price: grandTotal,
          service_description: fullDescription,
        } as any)
        .eq("id", appointment!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      toast.success("Agendamento atualizado!");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCustomItem = () => {
    const price = parseFloat(customPrice.replace(",", "."));
    if (!customName.trim() || isNaN(price) || price <= 0) {
      toast.error("Preencha nome e valor válido.");
      return;
    }
    setCustomItems((prev) => [...prev, { name: customName.trim(), price }]);
    setCustomName("");
    setCustomPrice("");
  };

  const removeCustomItem = (idx: number) => {
    setCustomItems((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary">Editar Serviços</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Services checklist */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Serviços do catálogo</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {services?.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2 cursor-pointer hover:border-primary transition-colors"
                >
                  <Checkbox
                    checked={selectedServiceIds.has(s.id)}
                    onCheckedChange={() => toggleService(s.id)}
                  />
                  <span className="flex-1 text-sm text-white">{s.name}</span>
                  <span className="text-sm font-semibold text-white">
                    R$ {Number(s.price).toFixed(2).replace(".", ",")}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Custom items */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Serviço customizado</p>
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
                className="w-24 border-border bg-secondary"
              />
              <Button type="button" size="icon" variant="outline" onClick={addCustomItem}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {customItems.length > 0 && (
              <div className="mt-2 space-y-1">
                {customItems.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-border bg-secondary px-3 py-1.5">
                    <span className="text-sm text-white">{c.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        R$ {c.price.toFixed(2).replace(".", ",")}
                      </span>
                      <button onClick={() => removeCustomItem(i)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description preview */}
          {fullDescription && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
              <p className="text-xs text-muted-foreground">Descrição:</p>
              <p className="text-sm font-medium text-foreground">{fullDescription}</p>
            </div>
          )}

          {/* Total */}
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">Novo Total:</span>
              <span className="text-xl font-bold text-primary">
                R$ {grandTotal.toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || grandTotal <= 0}
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
