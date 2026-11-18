import { useParams } from 'react-router-dom';
import ContentPage from '@/pages/ContentPage';

export default function PageBySlug() {
  const { slug = '' } = useParams();
  return <ContentPage key={slug} slug={slug} />;
}
