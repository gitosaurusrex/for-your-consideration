import { Link, NavLink, type LinkProps, type NavLinkProps } from 'react-router';

/** Router links that animate with the View Transitions API (where supported). */
export const VLink = (props: LinkProps) => <Link viewTransition {...props} />;
export const VNavLink = (props: NavLinkProps) => <NavLink viewTransition {...props} />;
