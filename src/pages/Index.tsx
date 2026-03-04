import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Scissors, Clock, MapPin, Phone, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import logoFalFallback from "@/assets/logo-fal.png";
import { useBusinessName } from "@/hooks/useBusinessName";
import { useAppearance } from "@/hooks/useAppearance";

const Index = () => {
  const navigate = useNavigate();
  const { businessName } = useBusinessName();
  const appearance = useAppearance();

  const { data: reviewsData } = useQuery({
    queryKey: ["avaliacoes_resumo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avaliacoes")
        .select("estrelas");

      if (error) {
        console.error("Erro ao buscar avaliações:", error);
        return { average: 0, total: 0 };
      }

      if (!data || data.length === 0) return { average: 0, total: 0 };

      const total = data.length;
      const sum = data.reduce((acc, curr) => acc + (curr.estrelas || 0), 0);
      return {
        average: Number((sum / total).toFixed(1)),
        total
      };
    }
  });

  return (
    <main
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden"
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
          Estilo & Atitude
        </p>
        <div className="mb-8 h-px w-24 bg-primary/40" />

        {/* CTA */}
        <Button
          size="lg"
          className="mb-10 gap-3 rounded-full px-10 py-6 text-base font-bold uppercase tracking-wider shadow-lg shadow-primary/30 transition-all hover:shadow-xl hover:shadow-primary/40 hover:scale-105 sm:text-lg sm:px-14 bg-primary text-primary-foreground hover:bg-primary/90"
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

      <footer className="absolute bottom-4 z-10 w-full flex flex-col items-center">
        <button
          onClick={() => navigate("/admin-login")}
          className="text-[10px] text-muted-foreground/30 transition-colors hover:text-primary mb-2"
        >
          Área do Barbeiro
        </button>
        <span className="text-[10px] text-muted-foreground/40 font-medium">
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
