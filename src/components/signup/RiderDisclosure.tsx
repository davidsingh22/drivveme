import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface RiderDisclosureProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const RiderDisclosure = ({ checked, onCheckedChange }: RiderDisclosureProps) => {
  const { language } = useLanguage();
  const [showDisclosure, setShowDisclosure] = useState(false);
  const isFr = language === 'fr';

  const disclosureText = isFr
    ? `Divulgation aux passagers Drivveme\n\nDrivveme est une plateforme technologique qui met en relation des passagers avec des chauffeurs indépendants.\n\nDrivveme ne fournit pas de services de transport et n'emploie pas de chauffeurs. Tous les chauffeurs utilisant la plateforme Drivveme sont des entrepreneurs indépendants.\n\nEn utilisant la plateforme Drivveme, vous reconnaissez que les courses sont fournies par des chauffeurs indépendants et que l'utilisation de la plateforme se fait à vos propres risques.`
    : `Drivveme Rider Disclosure\n\nDrivveme is a technology platform that connects riders with independent drivers.\n\nDrivveme does not provide transportation services and does not employ drivers. All drivers using the Drivveme platform are independent contractors.\n\nBy using the Drivveme platform, you acknowledge that rides are provided by independent drivers and that use of the platform is at your own risk.`;

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <Label className="text-base font-medium">{isFr ? 'Divulgation aux passagers' : 'Rider Disclosure'}</Label>
      <Button type="button" variant="outline" className="w-full justify-between" onClick={() => setShowDisclosure(!showDisclosure)}>
        <span className="flex items-center gap-2"><FileText className="h-4 w-4" />{isFr ? 'Voir la divulgation Drivveme' : 'View Drivveme Rider Disclosure'}</span>
        {showDisclosure ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {showDisclosure && (
        <div className="bg-muted rounded-lg p-4 border border-border">
          <ScrollArea className="h-48">
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{disclosureText}</p>
          </ScrollArea>
        </div>
      )}
      <div className="flex items-start space-x-3 pt-2">
        <Checkbox id="rider-agreement" checked={checked} onCheckedChange={(checked) => onCheckedChange(checked === true)} className="mt-0.5" />
        <label htmlFor="rider-agreement" className="text-sm cursor-pointer leading-relaxed">
          {isFr ? "J'accepte les Conditions d'utilisation des passagers et reconnais la Divulgation." : "I agree to the Rider Terms of Use and acknowledge the Disclosure."}
          <span className="text-destructive ml-1">*</span>
        </label>
      </div>
    </div>
  );
};

export default RiderDisclosure;
