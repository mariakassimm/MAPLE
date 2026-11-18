import readline from 'node:readline/promises';
import { connectDb, disconnectDb } from '../src/config/db';
import { emailSchema, nameSchema, passwordSchema } from '../src/common/validators';
import { recordAudit } from '../src/modules/audit/audit.service';
import { User } from '../src/modules/users/user.model';
import { insertUser } from '../src/modules/users/user.service';

// Reads a password without echoing it, so it never lands on screen or in shell history.
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') process.exit(130);
        value = c === '\u007f' || c === '\b' ? value.slice(0, -1) : value + c;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  await connectDb();
  try {
    if (await User.exists({ role: 'super_admin' })) {
      console.error('A super admin already exists. Additional staff are created from the admin area.');
      process.exitCode = 1;
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const name = nameSchema.parse(await rl.question('Full name: '));
    const email = emailSchema.parse(await rl.question('Email: '));
    rl.close();

    const password = passwordSchema.parse(await promptHidden('Password (min 10 chars, letters + numbers): '));
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) throw new Error('Passwords do not match.');

    const user = await insertUser({ name, email, password, role: 'super_admin' });
    await recordAudit({ action: 'staff.bootstrap', resourceType: 'user', resourceId: String(user._id), metadata: { email } });
    console.log(`Super admin created: ${email}`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
