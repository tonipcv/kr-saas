import { baseTemplate } from '../layouts/base';
import { ReferralEmailProps } from '../types';

export interface ReferralNotificationProps {
  doctorName: string;
  leadName: string;
  leadEmail: string;
  leadPhone?: string;
  referrerName?: string;
  referrerEmail?: string;
  status: 'PENDING' | 'CONVERTED';
  clinicName?: string;
  clinicLogo?: string;
  baseUrl: string;
}

export const createReferralNotification = ({
  doctorName,
  leadName,
  leadEmail,
  leadPhone,
  referrerName,
  referrerEmail,
  status,
  baseUrl
}: ReferralNotificationProps) => {
  const content = `
    <div>
      <p>New referral received</p>
      
      <p>
        ${leadName} (${leadEmail})
        ${leadPhone ? `<br>${leadPhone}` : ''}
        ${referrerName ? `<br>Referred by ${referrerName}` : ''}
      </p>
      
      ${status === 'CONVERTED' ? `
        <p>✓ Already a patient</p>
      ` : `
        <p>Contact this lead to schedule a consultation →</p>
      `}
      
      <p><a href="${baseUrl}/doctor/referrals">View referrals</a></p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'htps.io'
  });
};

export const createReferralEmail = ({
  referralName,
  referrerName,
  doctorName
}: ReferralEmailProps) => {
  const content = `
    <div style="font-size: 16px;">
      <p style="font-size: 20px; font-weight: 500;">New patient referral</p>
      
      <p>
        ${referralName}<br>
        Referred by ${referrerName}
      </p>
      
      <p>Contact the patient to schedule a consultation →</p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'htps.io',
    doctorName
  });
} 