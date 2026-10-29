import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./layout/Shell.tsx";
import { Console } from "./screens/Console.tsx";
import { Policies } from "./screens/Policies.tsx";
import { Trace } from "./screens/Trace.tsx";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Console />} />
        <Route path="policies" element={<Policies />} />
        <Route path="trace" element={<Trace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
