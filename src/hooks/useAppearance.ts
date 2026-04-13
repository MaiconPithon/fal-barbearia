import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

const FONT_MAP: Record<string, string> = {
  Inter: "'Inter', sans-serif",
  Roboto: "'Roboto', sans-serif",
  Montserrat: "'Montserrat', sans-serif",
  Poppins: "'Poppins', sans-serif",
  Oswald: "'Oswald', sans-serif",
};

const GOOGLE_FONTS_URL: Record<string, string> = {
  Roboto: "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&display=swap",
  Montserrat: "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap",
  Poppins: "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap",
};

export function useAppearance() {
  const { data: settings } = useQuery({
    queryKey: ["appearance-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("key, value")
        .in("key", ["primary_color", "background_color", "info_color", "font_family", "title_bold", "title_italic", "background_image", "logo_image"]);
      if (error) throw error;
      const map: Record<string, string> = {};
      data.forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;

    if (settings.primary_color) {
      root.style.setProperty("--primary", settings.primary_color);
      root.style.setProperty("--accent", settings.primary_color);
      root.style.setProperty("--ring", settings.primary_color);
      root.style.setProperty("--sidebar-primary", settings.primary_color);
      root.style.setProperty("--sidebar-ring", settings.primary_color);
    }

    if (settings.background_color) {
      root.style.setProperty("--background", settings.background_color);
      root.style.setProperty("--sidebar-background", settings.background_color);
    }

    // Font
    const fontKey = settings.font_family || "Inter";
    const fontStack = FONT_MAP[fontKey] || FONT_MAP.Inter;
    document.body.style.fontFamily = fontStack;

    // Load Google Font if needed
    if (GOOGLE_FONTS_URL[fontKey]) {
      const existingLink = document.querySelector(`link[data-appearance-font]`);
      if (existingLink) existingLink.remove();
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = GOOGLE_FONTS_URL[fontKey];
      link.setAttribute("data-appearance-font", "true");
      document.head.appendChild(link);
    }

    // Title styling
    const style = document.querySelector("style[data-appearance-titles]") as HTMLStyleElement
      || (() => { const s = document.createElement("style"); s.setAttribute("data-appearance-titles", "true"); document.head.appendChild(s); return s; })();
    const bold = settings.title_bold === "true" ? "700" : "400";
    const italic = settings.title_italic === "true" ? "italic" : "normal";
    style.textContent = `h1, h2, h3, h4, h5, h6 { font-weight: ${bold} !important; font-style: ${italic} !important; }`;
  }, [settings]);

  return settings;
}
