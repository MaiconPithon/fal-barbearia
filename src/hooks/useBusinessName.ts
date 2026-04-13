import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export function useBusinessName() {
  const { data: businessName, isLoading } = useQuery({
    queryKey: ["business-name"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings" as any)
        .select("value")
        .eq("key", "business_name")
        .single();
      if (error) return "Barbearia";
      return (data as any)?.value || "Barbearia";
    },
    staleTime: 1000 * 60 * 5,
  });

  return { businessName: businessName || "Barbearia", isLoading };
}
