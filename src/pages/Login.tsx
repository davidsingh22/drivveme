import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import LanguageToggle from "@/components/LanguageToggle";
import montrealNightBg from "@/assets/montreal-night-bg.jpg";

const Login = () => {
  const { t } = useLanguage();
  const { signIn, isLoading, roles, isRider, isDriver, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const justSignedIn = useRef(false);

  useEffect(() => {
    if (!isSubmitting) return;
    if (user) setIsSubmitting(false);
  }, [isSubmitting, user]);

  useEffect(() => {
    if (!user || !justSignedIn.current) return;
    const routeByRole = () => {
      justSignedIn.current = false;
      if (isAdmin) navigate("/admin", { replace: true });
      else if (isDriver) navigate("/driver", { replace: true });
      else navigate("landing", { replace: true });
    };
    if (roles.length > 0) {
      routeByRole();
      return;
    }
    const timeout = setTimeout(routeByRole, 2000);
    return () => clearTimeout(timeout);
  }, [user, roles.length, isAdmin, isDriver, isRider, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      justSignedIn.current = true;
      await signIn(email, password, rememberMe);
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img src={montrealNightBg} alt="" className="w-full h-full object-cover" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(270 60% 25% / 0.6) 0%, hsl(270 50% 10% / 0.8) 60%, hsl(270 40% 5% / 0.95) 100%)",
          }}
        />
      </div>

      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle />
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-start pt-12 pb-8 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Logo size="lg" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-md"
        >
          <div
            className="rounded-2xl p-8 border border-white/10"
            style={{
              background: "rgba(20, 10, 35, 0.75)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.4)",
            }}
          >
            <h2 className="font-display text-2xl font-bold text-center mb-1 text-foreground">{t("auth.loginTitle")}</h2>
            <p className="text-muted-foreground text-center text-sm mb-6">Connectez-vous pour continuer</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-background/50 border-white/10"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-background/50 border-white/10 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-destructive text-sm text-center">{error}</p>}

              <Button type="submit" className="w-full gradient-primary shadow-button py-6" disabled={isSubmitting}>
                {isSubmitting ? t("common.loading") : t("auth.loginBtn")}
              </Button>
            </form>

            <p className="mt-6 text-center text-muted-foreground text-sm">
              {t("auth.noAccount")}{" "}
              <Link to="/signup" className="text-primary hover:underline">
                {t("nav.signup")}
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
