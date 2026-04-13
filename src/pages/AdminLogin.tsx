import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home } from "lucide-react";

type Mode = "login" | "forgot" | "magic";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Exclude<Mode, "signup">>("login");
  const navigate = useNavigate();

  // Auto-redirect if already logged in as admin
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .in("role", ["admin", "super_admin"]);
        if (roles && roles.length > 0) {
          navigate("/admin");
        }
      }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .in("role", ["admin", "super_admin"]);
        if (roles && roles.length > 0) {
          navigate("/admin");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkAdminAndNavigate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"]);
    if (roles && roles.length > 0) {
      navigate("/admin");
    } else {
      toast.error("Você não tem permissão de administrador.");
      await supabase.auth.signOut();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Email ou senha incorretos.");
    } else {
      await checkAdminAndNavigate();
    }
    setLoading(false);
  };


  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Informe seu e-mail."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    }
    setLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Informe seu e-mail."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Link mágico enviado! Verifique seu e-mail.");
    }
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader>
          <CardTitle className="text-center text-2xl text-primary">Área do Barbeiro</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mx-auto mt-2 gap-2 text-muted-foreground hover:text-primary">
            <Home className="h-4 w-4" /> Página Inicial
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
            <TabsList className="grid w-full grid-cols-1 mb-4">
              <TabsTrigger value="login">Entrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">Email</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">Senha</label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
                <div className="flex flex-col gap-2 pt-2">
                  <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline">
                    Esqueci minha senha
                  </button>
                  <button type="button" onClick={() => setMode("magic")} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                    Entrar com link mágico (sem senha)
                  </button>
                </div>
              </form>
            </TabsContent>


            <TabsContent value="forgot">
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-sm text-muted-foreground">Informe seu e-mail para receber um link de redefinição de senha.</p>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">Email</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar Link de Recuperação"}
                </Button>
                <button type="button" onClick={() => setMode("login")} className="block w-full text-xs text-primary hover:underline pt-1">
                  Voltar ao login
                </button>
              </form>
            </TabsContent>

            <TabsContent value="magic">
              <form onSubmit={handleMagicLink} className="space-y-4">
                <p className="text-sm text-muted-foreground">Receba um link no seu e-mail para entrar sem senha.</p>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">Email</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar Magic Link"}
                </Button>
                <button type="button" onClick={() => setMode("login")} className="block w-full text-xs text-primary hover:underline pt-1">
                  Voltar ao login
                </button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
