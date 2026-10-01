import { motion } from 'framer-motion';

// Full-screen centered shell for the auth flow (landing, login, signup,
// email verification). Moved out of App.tsx so auth screens can live in
// their own files.
export const AuthShell = ({ children }: any) => (
  <div className="min-h-screen bg-primary flex items-center justify-center p-4 relative overflow-hidden">
    <div className="hero-grid absolute inset-0" />
    <div className="hero-glow absolute inset-0" />
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
      {children}
    </motion.div>
  </div>
);
