'use client';

export default function SubscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#1F1F1F]">
      {children}
    </div>
  );
}
