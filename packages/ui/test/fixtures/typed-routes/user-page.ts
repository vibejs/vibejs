import type { RouteParams } from '@vibejs-org/ui/router';

// The page is imported lazily by routes.ts, and its props are typed from those routes.
export const UserPage = {
  props: ['id'],
  setup(props: RouteParams<'user'>) {
    return { label: `User ${props.id}` };
  },
};
