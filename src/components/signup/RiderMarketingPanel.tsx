import { Shield } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import drivemeGirlsHero from '@/assets/driveme-girls-hero.png';

const RiderMarketingPanel = () => {
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const t = isFr ? {
    headline: 'Votre Sécurité', headlineAccent: 'Est Notre Priorité',
    subheadline: 'Pourquoi les passagers choisissent Drivveme',
    features: [
      { emoji: '✅', text: 'Chauffeurs Vérifiés' },
      { emoji: '🎤', text: 'Entrevues Personnelles Obligatoires' },
      { emoji: '👩', text: 'Sécurité des Femmes & des Ados =', accent: 'Priorité #1' },
      { emoji: '📍', text: 'Trajets Suivis en Direct' },
      { emoji: '✅', text: 'Normes Strictes & Surveillance Humaine' },
    ],
    warningTitle: "Pas n'importe qui ne peut devenir chauffeur", warningBrand: 'Drivveme.',
    trustBrand: 'Drivveme', trustLine: 'est fondé sur la confiance: un choix plus sûr, pour vous et vos proches.',
  } : {
    headline: 'Your Safety', headlineAccent: 'Is Our Priority',
    subheadline: 'Why Riders Choose Drivveme',
    features: [
      { emoji: '✅', text: 'Background Checked Drivers' },
      { emoji: '🎤', text: 'Personal Interviews Required' },
      { emoji: '👩', text: 'Women & Teen Safety Is', accent: '#1 Priority' },
      { emoji: '📍', text: 'Live Ride Monitoring by Real People' },
      { emoji: '✅', text: 'Strict Standards & Human Oversight' },
    ],
    warningTitle: 'Not just anyone can drive for', warningBrand: 'Drivveme.',
    trustBrand: 'Drivveme', trustLine: 'is built on trust: a safer choice, for you and your loved ones.',
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, hsl(270, 60%, 8%) 0%, hsl(275, 55%, 15%) 20%, hsl(280, 50%, 25%) 50%, hsl(285, 45%, 35%) 80%, hsl(290, 40%, 40%) 100%)' }} />
      <div className="relative z-10 flex flex-col h-full p-6 xl:p-8 text-white">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/20 border border-primary/30"><Shield className="w-6 h-6 xl:w-7 xl:h-7 text-primary" /></div>
          <h1 className="text-2xl xl:text-3xl font-bold tracking-tight">
            <span className="text-white">{t.headline}</span> <span className="text-primary">{t.headlineAccent}</span>
          </h1>
        </div>
        <h2 className="text-lg xl:text-xl font-semibold text-center mb-5 text-white/90">{t.subheadline}</h2>
        <div className="space-y-2.5 mb-5">
          {t.features.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xl flex-shrink-0">{f.emoji}</span>
              <span className="text-base xl:text-lg font-medium">{f.text}{f.accent && <span className="text-primary font-bold"> {f.accent}</span>}</span>
            </div>
          ))}
        </div>
        <div className="mb-4">
          <p className="text-base xl:text-lg font-bold">{t.warningTitle} <span className="text-primary">{t.warningBrand}</span></p>
        </div>
        <div className="border-t border-white/20 my-4" />
        <div className="flex-1 flex items-end relative mt-2">
          <div className="flex items-end gap-4 w-full">
            <img src={drivemeGirlsHero} alt="Happy riders" className="w-[45%] max-w-[200px] h-auto rounded-xl object-cover shadow-xl shadow-black/40" />
            <div className="flex-1 pb-4">
              <p className="text-base xl:text-lg leading-relaxed">
                <span className="font-bold text-primary">{t.trustBrand}</span> {t.trustLine}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiderMarketingPanel;
