import { Car, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import driverHero from '@/assets/driveme-driver-hero.png';

const DriverMarketingPanel = () => {
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const t = isFr ? {
    headline: 'Les Chauffeurs Sont des', headlineAccent: 'Travailleurs Autonomes',
    subheadline: 'Gagnez plus avec Drivveme!',
    features: [
      { bold: 'Revenus maximisés,', text: 'coûts minimisés pour les passagers' },
      { bold: 'Respect et Valorisation', text: 'des Travailleurs Autonomes' },
      { bold: 'Rémunération Juste, Transparente,', text: 'sur la', accent: 'Valeur Réelle' },
      { bold: "Culture d'Équipe", text: 'où Tous les Chauffeurs sont', accent: 'Partenaires' },
      { bold: 'Travail Remarqué & Récompensé', text: '—Vous Comptez', accent: 'Toujours!' },
    ],
    driversFirst: 'Chez Drivveme,', driversFirstAccent: 'Les Chauffeurs Passent en Premier.',
    beBoss: 'Soyez votre propre patron.', beBossText: 'Travaillez avec une équipe qui reconnaît vos efforts.',
  } : {
    headline: 'Drivers Are', headlineAccent: 'Independent Contractors',
    subheadline: 'Earn More with Drivveme!',
    features: [
      { bold: 'Highest Earnings,', text: 'Lowest Rider Costs—Everyone Wins!' },
      { bold: 'Drivers Are Respected', text: 'Independent Contractors' },
      { bold: 'Fair & Transparent', text: 'Pay Based on', accent: 'Real Value' },
      { bold: 'Team', text: 'Culture Where All Drivers Are', accent: 'Valued Partners' },
      { bold: 'Hard Work', text: 'is Noticed & Rewarded—You Always', accent: 'Matter!' },
    ],
    driversFirst: 'At Drivveme,', driversFirstAccent: 'Drivers Come First.',
    beBoss: 'Be Your Own Boss', beBossText: "—Drive with a Team That's Got Your Back!",
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, hsl(280, 60%, 8%) 0%, hsl(275, 55%, 18%) 25%, hsl(270, 50%, 30%) 50%, hsl(285, 45%, 40%) 75%, hsl(300, 40%, 50%) 100%)' }} />
      <div className="relative z-10 flex flex-col h-full p-6 xl:p-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/20 border border-primary/40 shadow-lg shadow-primary/20"><Car className="h-7 w-7 text-primary" /></div>
          <h1 className="text-xl xl:text-2xl font-bold tracking-tight">
            <span className="text-white">{t.headline}</span> <span className="text-primary italic">{t.headlineAccent}</span>
          </h1>
        </div>
        <h2 className="text-xl xl:text-2xl font-bold mb-3">{t.subheadline}</h2>
        <div className="space-y-2.5 mb-4">
          {t.features.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-shrink-0 p-1 rounded-md bg-emerald-500/20 border border-emerald-400/40"><ShieldCheck className="h-5 w-5 text-emerald-400" /></div>
              <span className="text-sm font-medium leading-tight">
                {f.bold && <span className="font-bold">{f.bold}</span>} {f.text}
                {f.accent && <span className="text-primary font-bold"> {f.accent}</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="mb-3">
          <p className="text-xl xl:text-2xl font-bold">{t.driversFirst} <span className="text-primary">{t.driversFirstAccent}</span></p>
          <p className="text-sm text-white/80 mt-1"><span className="italic">{t.beBoss}</span>{t.beBossText}</p>
        </div>
        <div className="mt-auto relative">
          <img src={driverHero} alt="Drivveme Driver" className="w-full h-auto max-h-[280px] object-contain object-bottom rounded-lg" />
          <div className="absolute inset-x-0 top-0 h-16 pointer-events-none" style={{ background: 'linear-gradient(to bottom, hsl(285, 45%, 40%), transparent)' }} />
        </div>
      </div>
    </div>
  );
};

export default DriverMarketingPanel;
