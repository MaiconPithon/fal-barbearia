import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export function PriceTable() {
  const { data: services, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <section className="mx-auto w-full max-w-md px-4 py-10">
      <h2 className="mb-6 text-center text-3xl font-bold uppercase tracking-wide text-primary">
        Tabela de Preços
      </h2>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-primary">Serviço</TableHead>
              <TableHead className="text-right text-primary">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 7 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-16" /></TableCell>
                  </TableRow>
                ))
              : services?.map((s) => (
                  <TableRow key={s.id} className="border-border">
                    <TableCell className="font-medium text-foreground">{s.name}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      R$ {s.price.toFixed(2).replace(".", ",")}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
