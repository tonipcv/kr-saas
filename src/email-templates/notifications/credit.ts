import { baseTemplate } from '../layouts/base';
import { CreditEmailProps } from '../types';

export const createCreditEmail = ({
  name,
  amount,
  type,
}: CreditEmailProps) => {
  const typeText = {
    CONSULTATION_REFERRAL: 'consultation',
    COURSE_REFERRAL: 'course',
    PRODUCT_REFERRAL: 'product'
  }[type];

  const content = `
    <div style="font-size: 16px;">
      <p style="font-size: 20px; font-weight: 500;">New referral credit</p>
      
      <p>
        ${amount} credit${amount > 1 ? 's' : ''} for ${typeText} referral
      </p>
      
      <p>Keep referring to earn more credits →</p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'htps.io'
  });
} 