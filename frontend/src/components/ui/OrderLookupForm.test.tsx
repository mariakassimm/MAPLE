import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OrderLookupForm } from '@/components/ui/OrderLookupForm';

describe('OrderLookupForm', () => {
  it('rejects a malformed order number or phone without calling the API', async () => {
    const onSubmit = vi.fn();
    render(<OrderLookupForm label="Track order" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Order number'), 'nope');
    await userEvent.type(screen.getByLabelText('Mobile number'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Track order' }));
    expect(await screen.findByText(/order numbers look like/i)).toBeInTheDocument();
    expect(screen.getByText(/enter the mobile number/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('normalises the order number and phone before submitting', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<OrderLookupForm label="Track order" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Order number'), 'mpl-ab12cd34');
    await userEvent.type(screen.getByLabelText('Mobile number'), '0300 123 4567');
    await userEvent.click(screen.getByRole('button', { name: 'Track order' }));
    expect(onSubmit).toHaveBeenCalledWith('MPL-AB12CD34', '03001234567');
  });
  it('shows a lookup failure as an alert', async () => {
    render(<OrderLookupForm label="Track order" onSubmit={() => Promise.reject(new Error('No matching order.'))} />);
    await userEvent.type(screen.getByLabelText('Order number'), 'MPL-AB12CD34');
    await userEvent.type(screen.getByLabelText('Mobile number'), '03001234567');
    await userEvent.click(screen.getByRole('button', { name: 'Track order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No matching order.');
  });
});
