import { Controller, Handle, inject, type Ctx } from '@usevibejs/server';
import { projects, type Project } from '../../../contracts/src/projects.contract.ts';
import { ProjectsService } from './projects.service.ts';

@Controller(projects)
export class ProjectsController {
  private readonly projects = inject(ProjectsService);

  @Handle(projects.list)
  list(): Project[] {
    return this.projects.list();
  }

  @Handle(projects.create)
  create(ctx: Ctx<typeof projects.create>): Project {
    return this.projects.create(ctx.body);
  }
}
