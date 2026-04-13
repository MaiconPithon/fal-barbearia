import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Palette, Type, Bold, Italic } from "lucide-react";
import { toast } from "sonner";

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Poppins", label: "Poppins" },
  { value: "Oswald", label: "Oswald" },
];

function hslToHex(hslStr: string): string {
  const parts = hslStr.trim().split(/\s+/);
  const h = parseFloat(parts[0]) || 0;
  const s = (parseFloat(parts[1]) || 0) / 100;
  const l = (parseFloat(parts[2]) || 0) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): string {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface Props {
  settings: Record<string, string> | undefined;
}

export function AppearanceTab({ settings }: Props) {
  const queryClient = useQueryClient();
  const [primaryColor, setPrimaryColor] = useState("#d4a017");
  const [bgColor, setBgColor] = useState("#0a0a0a");
  const [infoColor, setInfoColor] = useState("#ffffff");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [titleBold, setTitleBold] = useState(true);
  const [titleItalic, setTitleItalic] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    if (settings.primary_color) setPrimaryColor(hslToHex(settings.primary_color));
    if (settings.background_color) setBgColor(hslToHex(settings.background_color));
    if (settings.info_color) setInfoColor(hslToHex(settings.info_color));
    if (settings.font_family) setFontFamily(settings.font_family);
    setTitleBold(settings.title_bold === "true");
    setTitleItalic(settings.title_italic === "true");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: "primary_color", value: hexToHsl(primaryColor) },
        { key: "background_color", value: hexToHsl(bgColor) },
        { key: "info_color", value: hexToHsl(infoColor) },
        { key: "font_family", value: fontFamily },
        { key: "title_bold", value: String(titleBold) },
        { key: "title_italic", value: String(titleItalic) },
      ];
      for (const u of updates) {
        const { data: existing } = await supabase
          .from("business_settings")
          .select("id")
          .eq("key", u.key)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase
            .from("business_settings")
            .update({ value: u.value })
            .eq("key", u.key);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("business_settings" as any)
            .insert({ key: u.key, value: u.value } as any);
          if (error) throw error;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["appearance-settings"] });
      toast.success("Aparência salva com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar.");
    }
    setSaving(false);
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Colors */}
      <Card className="border-border bg-card md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Palette className="h-5 w-5" /> Cores do Site
          </CardTitle>
          <p className="text-sm text-muted-foreground">As cores serão aplicadas em todo o site (landing, agendamento, painel).</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Cor Principal (botões, destaques)</label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-12 w-16 cursor-pointer border-border p-1"
                />
                <span className="text-sm text-muted-foreground">{primaryColor}</span>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Cor de Fundo</label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="h-12 w-16 cursor-pointer border-border p-1"
                />
                <span className="text-sm text-muted-foreground">{bgColor}</span>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Cor de Informações (telefone, horário, local)</label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  value={infoColor}
                  onChange={(e) => setInfoColor(e.target.value)}
                  className="h-12 w-16 cursor-pointer border-border p-1"
                />
                <span className="text-sm text-muted-foreground">{infoColor}</span>
              </div>
            </div>
          </div>
          <Button className="mt-4" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar Cores"}
          </Button>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Type className="h-5 w-5" /> Tipografia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Fonte do Site</label>
            <Select value={fontFamily} onValueChange={setFontFamily}>
              <SelectTrigger className="border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">Estilo dos Títulos</label>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={titleBold} onCheckedChange={setTitleBold} />
                <Bold className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">Negrito</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={titleItalic} onCheckedChange={setTitleItalic} />
                <Italic className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">Itálico</span>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-border bg-secondary p-4">
            <p className="text-xs text-muted-foreground mb-2">Pré-visualização:</p>
            <h3
              style={{
                fontFamily: `'${fontFamily}', sans-serif`,
                fontWeight: titleBold ? 700 : 400,
                fontStyle: titleItalic ? "italic" : "normal",
                color: primaryColor,
              }}
              className="text-xl"
            >
              Título de Exemplo
            </h3>
            <p style={{ fontFamily: `'${fontFamily}', sans-serif` }} className="text-sm text-foreground mt-1">
              Texto do corpo com a fonte selecionada.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save button full width */}
      <div className="md:col-span-2">
        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar Aparência"}
        </Button>
      </div>
    </div>
  );
}
