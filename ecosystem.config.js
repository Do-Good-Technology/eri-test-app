module.exports = {
  apps: [
    {
      name: "eri-hono-server",
      cwd: "./server",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "eri-react-client",
      cwd: "./client",
      script: "npm",
      args: "run dev", // Or "run preview" if using build output
      env: {
        NODE_ENV: "production",
        PORT: 5173,
      },
    },
  ],
};
