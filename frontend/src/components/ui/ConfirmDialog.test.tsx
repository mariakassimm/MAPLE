import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { ConfirmProvider, useConfirm } from '@/components/ui/ConfirmDialog';

function Harness() {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState('none');
  return (
    <>
      <button
        onClick={async () =>
          setAnswer(
            (await confirm({ title: 'Remove this address?', description: 'Gone for good.', confirmLabel: 'Remove' }))
              ? 'yes'
              : 'no',
          )
        }
      >
        Open
      </button>
      <output>{answer}</output>
    </>
  );
}
const setup = () =>
  render(
    <ConfirmProvider>
      <Harness />
    </ConfirmProvider>,
  );

describe('ConfirmDialog', () => {
  it('is an accessible, labelled alert dialog with focus on the safe choice', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Remove this address?' });
    expect(dialog).toHaveAccessibleDescription('Gone for good.');
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus();
  });
  it('resolves true on confirm', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('status')).toHaveTextContent('yes');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('resolves false on Escape and returns focus to the opener', async () => {
    setup();
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('status')).toHaveTextContent('no');
    expect(opener).toHaveFocus();
  });
});
