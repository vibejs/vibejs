import { defineContract, get, post } from '@vibejs-org/contract';
import * as v from 'valibot';

export const Project = v.object({ id: v.string(), name: v.string() });
export type Project = v.InferOutput<typeof Project>;

export const CreateProject = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
});
export type CreateProject = v.InferOutput<typeof CreateProject>;

export const projects = defineContract('/projects', {
  list: get('/', { response: v.array(Project) }),
  create: post('/', { body: CreateProject, response: Project }),
});
