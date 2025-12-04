import { baseTemplate } from '../layouts/base';
import { DoctorInvitationEmailProps } from '../types';

export const createDoctorInvitationEmail = ({
  name,
  inviteUrl,
  subscriptionType,
  trialDays
}: DoctorInvitationEmailProps) => {
  const content = `
    <div>
      <p>Welcome to htps.io</p>
      
      <p>
        Set up your doctor account →<br>
        ${subscriptionType === 'TRIAL' ? `${trialDays} days free trial` : 'Active subscription'}
      </p>
      
      <p>
        Your plan includes:<br>
        • Up to 50 patients<br>
        • Up to 10 protocols<br>
        • Up to 5 courses<br>
        • Up to 30 products
      </p>
      
      <p><a href="${inviteUrl}">Set password →</a></p>
      
      <p>This link expires in 7 days</p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'htps.io'
  });
} 