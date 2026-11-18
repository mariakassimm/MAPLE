import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AutoPostForm } from '@/components/ui/AutoPostForm';

describe('AutoPostForm', () => {
  it('refuses to post to a non-https target', () => {
    render(<AutoPostForm form={{ method: 'POST', action: 'http://evil.example/pay', fields: { a: '1' } }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('refuses javascript: targets', () => {
    render(<AutoPostForm form={{ method: 'POST', action: 'javascript:alert(1)', fields: {} }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
