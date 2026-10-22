import { createContext, useContext } from "react";
import type { Dataset } from "../domain/model";
export type EditorRequest = {
  kind:
    | "course"
    | "lecture"
    | "revision"
    | "assessment"
    | "session"
    | "manual"
    | "resource"
    | "semester"
    | "type";
  id?: string;
  courseId?: string;
  lectureId?: string;
};
export interface StudyContextValue {
  data: Dataset;
  run: (
    mutate: (d: Dataset) => void,
    message?: string,
    options?: { restore?: boolean },
  ) => Promise<boolean>;
  edit: (request: EditorRequest) => void;
  semesterId: string;
  saveError?: string;
  cloud?: boolean;
}
export const StudyContext = createContext<StudyContextValue | undefined>(
  undefined,
);
export function useStudy() {
  const c = useContext(StudyContext);
  if (!c) throw new Error("Study provider missing");
  return c;
}
