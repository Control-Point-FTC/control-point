// How a click on a record link (task, meeting…) opens it in the app. The
// page editor provides it; canvas text boxes on the page use the same one.
import { createContext } from 'react';

export const RecordNavigationContext = createContext<((path: string) => void) | null>(null);
