import type { Dataset } from "../domain/model";
export interface Snapshot {
  data: Dataset;
  revision: number;
}
export interface StudyRepository {
  load(): Promise<Snapshot | undefined>;
  // The revision check prevents one browser tab from overwriting another.
  replace(data: Dataset, expectedRevision: number): Promise<Snapshot>;
}
