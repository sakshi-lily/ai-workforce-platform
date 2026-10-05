import { app } from "./app";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[AI Workforce Platform Backend] Server is running on http://localhost:${PORT}`);
  console.log(`[AI Workforce Platform Backend] Health check ready at http://localhost:${PORT}/api/health`);
});
