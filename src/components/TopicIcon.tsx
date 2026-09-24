import {
  Bike, Briefcase, Clapperboard, Flashlight, House, Mountain, Music, Palette, PawPrint, Pizza, Plane, Shirt, Tag,
  Trees, Trophy, Umbrella, WandSparkles, type LucideIcon,
} from "lucide-react";

// topic icon names (from the word data) → components; explicit so only these icons are bundled
const ICONS: Record<string, LucideIcon> = {
  Bike, Briefcase, Clapperboard, Flashlight, House, Mountain, Music, Palette, PawPrint, Pizza, Plane, Shirt, Trees,
  Trophy, Umbrella, WandSparkles,
};

export function TopicIcon({ name, className = "size-4" }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Tag;
  return <Icon className={className} aria-hidden strokeWidth={2.25} />;
}
