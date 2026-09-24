import {
  Bike, Briefcase, Building2, Clapperboard, CloudSun, CookingPot, Flashlight, House, Mountain, Music, Palette, PartyPopper,
  PawPrint, PersonStanding, Pizza, Plane, Rocket, School, Shirt, Tag, Tractor, Trees, Trophy, Umbrella, WandSparkles, Waves,
  Wrench, type LucideIcon,
} from "lucide-react";

// topic icon names (from the word data) → components; explicit so only these icons are bundled
const ICONS: Record<string, LucideIcon> = {
  Bike, Briefcase, Building2, Clapperboard, CloudSun, CookingPot, Flashlight, House, Mountain, Music, Palette, PartyPopper,
  PawPrint, PersonStanding, Pizza, Plane, Rocket, School, Shirt, Tractor, Trees, Trophy, Umbrella, WandSparkles, Waves, Wrench,
};

export function TopicIcon({ name, className = "size-4" }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Tag;
  return <Icon className={className} aria-hidden strokeWidth={2.25} />;
}
