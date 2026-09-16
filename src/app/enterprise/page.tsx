import { redirect } from 'next/navigation';

export default function EnterpriseRoot(): never {
  redirect('/enterprise/overview');
}
