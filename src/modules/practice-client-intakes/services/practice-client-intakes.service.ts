import { intakeCheckoutService } from '@/modules/practice-client-intakes/services/intake-checkout.service';
import { intakeCreationService } from '@/modules/practice-client-intakes/services/intake-creation.service';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';

export const practiceClientIntakesService = {
  ...intakeCreationService,
  ...intakeCheckoutService,
  ...intakeLifecycleService,
};
