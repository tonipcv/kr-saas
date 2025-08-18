// This page was deprecated. It intentionally returns 404 to remove it from the app.
import { notFound } from 'next/navigation';

export default function Page() {
  notFound();
  return null;
}
