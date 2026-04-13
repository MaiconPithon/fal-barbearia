import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface BookingCheckoutBoundaryProps {
  children: ReactNode;
}

interface BookingCheckoutBoundaryState {
  hasError: boolean;
}

export class BookingCheckoutBoundary extends Component<BookingCheckoutBoundaryProps, BookingCheckoutBoundaryState> {
  state: BookingCheckoutBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): BookingCheckoutBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
          <Card className="w-full max-w-md border-border bg-card shadow-lg">
            <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-foreground">Ops! Ocorreu um erro na sua tela</h1>
                <p className="text-sm text-muted-foreground">Por favor, recarregue para continuar o agendamento.</p>
              </div>
              <Button className="w-full" onClick={this.handleReload}>
                Recarregar página
              </Button>
            </CardContent>
          </Card>
        </main>
      );
    }

    return this.props.children;
  }
}