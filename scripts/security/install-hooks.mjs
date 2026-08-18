if (process.env.CI === 'true' || process.env.NODE_ENV === 'production') process.exit(0);

const husky = (await import('husky')).default;
const error = husky();
if (error) {
  console.error(error);
  process.exitCode = 1;
}
