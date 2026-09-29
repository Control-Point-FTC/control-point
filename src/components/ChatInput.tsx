import { useEffect, useRef } from 'react';
import { Send } from 'lucide-react';

// Multiline chat input: Enter sends, Shift+Enter inserts a newline.
// Autogrows up to ~5 lines, then scrolls.
export default function ChatInput({ value, onChange, onSend, disabled, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  }, [value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message"
        className="flex-1 min-w-0 bg-primary border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50 resize-none overflow-y-auto custom-scrollbar leading-relaxed"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="w-10 h-10 shrink-0 rounded-xl bg-accent text-primary flex items-center justify-center hover:brightness-110 active:scale-95 transition disabled:opacity-40"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
