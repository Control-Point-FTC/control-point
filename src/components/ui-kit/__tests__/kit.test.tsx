import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Button, Badge, Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, Tabs, TabsList, TabsTrigger, TabsContent } from '..';
import { Button as LegacyButton } from '../../ui';

afterEach(cleanup);

describe('UI kit', () => {
  it('maps the default button to the team accent', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).className).toMatch(/bg-accent/);
  });

  it('keeps the legacy Button variants working', () => {
    render(<><LegacyButton>Go</LegacyButton><LegacyButton variant="danger">Delete</LegacyButton></>);
    expect(screen.getByRole('button', { name: 'Go' }).className).toMatch(/bg-accent/);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toMatch(/rose/);
  });

  it('badge has a blue beta variant', () => {
    render(<Badge variant="beta">Beta</Badge>);
    expect(screen.getByText('Beta').className).toMatch(/sky/);
  });

  it('dialog opens, owns Escape, and closes', () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent><DialogTitle>Hello</DialogTitle><DialogDescription>Body</DialogDescription></DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByText('Open'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-esc-owner');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tabs switch content', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList><TabsTrigger value="a">A</TabsTrigger><TabsTrigger value="b">B</TabsTrigger></TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Panel A')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'B' }), { button: 0 });
    expect(screen.getByText('Panel B')).toBeInTheDocument();
  });
});
