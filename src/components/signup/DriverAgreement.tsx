import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { useLanguage } from '@/contexts/LanguageContext';

interface DriverAgreementProps {
  onComplete: (agreementData: { isIndependentContractor: boolean; isResponsibleForTaxes: boolean; agreesToTerms: boolean }) => void;
  isLoading?: boolean;
}

const DriverAgreement = ({ onComplete, isLoading }: DriverAgreementProps) => {
  const { language } = useLanguage();
  const [isIndependentContractor, setIsIndependentContractor] = useState(false);
  const [isResponsibleForTaxes, setIsResponsibleForTaxes] = useState(false);
  const [agreesToTerms, setAgreesToTerms] = useState(false);
  const allChecked = isIndependentContractor && isResponsibleForTaxes && agreesToTerms;

  const handleFinish = () => {
    if (allChecked) onComplete({ isIndependentContractor, isResponsibleForTaxes, agreesToTerms });
  };

  const isFr = language === 'fr';

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="font-display text-2xl font-bold">
          {isFr ? "ACCORD D'ENTREPRENEUR INDÉPENDANT DRIVVEME" : "DRIVVEME DRIVER INDEPENDENT CONTRACTOR AGREEMENT"}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">{isFr ? 'Dernière mise à jour' : 'Last Updated'}: {format(new Date(), 'MMMM d, yyyy')}</p>
      </div>

      <ScrollArea className="h-[400px] rounded-lg border border-border p-4">
        <div className="prose prose-sm max-w-none text-foreground">
          <p className="text-sm">
            {isFr
              ? 'Cet accord d\'entrepreneur indépendant pour chauffeur (« Accord ») est conclu entre Drivveme et le chauffeur individuel qui accepte cet Accord via la plateforme Drivveme.'
              : 'This Driver Independent Contractor Agreement ("Agreement") is entered into between Drivveme and the individual driver who accepts this Agreement through the Drivveme platform.'}
          </p>
          <p className="text-sm font-medium mt-4">
            {isFr
              ? 'En vous inscrivant en tant que chauffeur et en utilisant la plateforme Drivveme, vous reconnaissez avoir lu, compris et accepté les conditions ci-dessous.'
              : 'By registering as a driver and using the Drivveme platform, you acknowledge that you have read, understood, and agreed to the terms below.'}
          </p>
          {/* Agreement sections condensed for brevity - full legal text in production */}
          <h3 className="text-base font-bold mt-6">{isFr ? '1. Relation d\'entrepreneur indépendant' : '1. Independent Contractor Relationship'}</h3>
          <p className="text-sm">{isFr ? 'Vous êtes un entrepreneur indépendant et non un employé de Drivveme.' : 'You are an independent contractor and not an employee of Drivveme.'}</p>
          <h3 className="text-base font-bold mt-6">{isFr ? '2. Taxes et responsabilités financières' : '2. Taxes and Financial Responsibilities'}</h3>
          <p className="text-sm">{isFr ? 'Vous êtes seul responsable de déclarer et payer toutes les taxes applicables.' : 'You are solely responsible for reporting and paying all applicable taxes.'}</p>
          <h3 className="text-base font-bold mt-6">{isFr ? '3. Conformité aux lois' : '3. Compliance With Laws'}</h3>
          <p className="text-sm">{isFr ? 'Vous acceptez de respecter toutes les lois applicables.' : 'You agree to comply with all applicable laws.'}</p>
        </div>
      </ScrollArea>

      <div className="space-y-4 pt-4 border-t border-border">
        <h3 className="font-bold text-lg">{isFr ? 'Reconnaissance du chauffeur' : 'Driver Acknowledgement'}</h3>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Checkbox id="independent-contractor" checked={isIndependentContractor} onCheckedChange={(checked) => setIsIndependentContractor(checked === true)} />
            <label htmlFor="independent-contractor" className="text-sm cursor-pointer leading-relaxed">
              {isFr ? 'Je confirme que je suis un entrepreneur indépendant, et non un employé de Drivveme.' : 'I confirm that I am an independent contractor, not an employee of Drivveme.'}
            </label>
          </div>
          <div className="flex items-start space-x-3">
            <Checkbox id="taxes" checked={isResponsibleForTaxes} onCheckedChange={(checked) => setIsResponsibleForTaxes(checked === true)} />
            <label htmlFor="taxes" className="text-sm cursor-pointer leading-relaxed">
              {isFr ? 'Je comprends que je suis responsable de mes propres impôts et dépenses.' : 'I understand that I am responsible for my own taxes and expenses.'}
            </label>
          </div>
          <div className="flex items-start space-x-3">
            <Checkbox id="terms" checked={agreesToTerms} onCheckedChange={(checked) => setAgreesToTerms(checked === true)} />
            <label htmlFor="terms" className="text-sm cursor-pointer leading-relaxed">
              {isFr ? 'J\'accepte les termes de cet Accord.' : 'I agree to the terms of this Agreement.'}
            </label>
          </div>
        </div>
        <Button onClick={handleFinish} disabled={!allChecked || isLoading} className="w-full gradient-primary shadow-button py-6">
          {isLoading ? (isFr ? 'Traitement...' : 'Processing...') : (isFr ? 'Terminé' : 'Finished')}
        </Button>
      </div>
    </div>
  );
};

export default DriverAgreement;
