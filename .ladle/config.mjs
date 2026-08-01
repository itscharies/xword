/** @type {import('@ladle/react').UserConfig} */
export default {
  // The app's fonts load from index.html, which Ladle doesn't use — mirror
  // the same tags here so stories render with the real typography.
  appendToHead: `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=SN+Pro:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Jaro:opsz@6..72&display=swap" rel="stylesheet" />
  `,
};
