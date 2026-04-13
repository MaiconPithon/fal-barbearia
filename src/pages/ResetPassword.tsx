import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event from the auth redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });
    // Also check URL hash for recovery type
    if (window.location.hash.includes("type=recovery")) {
      setIsRecovery(true);
    }
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Senha atualizada com sucesso!");
      navigate("/admin-login");
    }
    setLoading(false);
  };

  if (!isRecovery) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm border-border bg-card">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Verificando link de recuperação...</p>
            <p className="mt-2 text-xs text-muted-foreground">Se você não recebeu o link, volte ao login e tente novamente.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/admin-login")}>
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader>
          <CardTitle className="text-center text-2xl text-primary">Nova Senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Nova senha</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Confirmar senha</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Nova Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
