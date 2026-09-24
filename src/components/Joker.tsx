import { Sparkles } from "lucide-react";

/** On the imposter card of someone spending a joker. */
export function JokerHint({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="pop mx-auto mt-6 w-fit rounded-2xl border border-glow/60 bg-white/10 px-4 py-2 [animation-delay:700ms]">
      <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-glow">
        <Sparkles className="size-4" aria-hidden /> {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold tracking-wider break-words">{hint}</p>
    </div>
  );
}

/** Result screen: which surviving imposters earned a joker. */
export function JokerEarned({ names, lang, text }: { names: string[]; lang: string; text: string }) {
  if (!names.length) return null;
  return (
    <p className="pop flex items-center justify-center gap-2 rounded-full bg-tint px-4 py-2 font-medium text-primary-ink [animation-delay:500ms]">
      <Sparkles className="size-5 shrink-0" aria-hidden />
      <span>
        <span className="font-bold">{new Intl.ListFormat(lang).format(names)}</span> {text}
      </span>
    </p>
  );
}
