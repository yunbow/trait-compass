import { fireEvent, screen } from "@testing-library/react";

export function selectMunicipality(name: string) {
  const input = screen.getByRole("combobox", { name: /お住まいの区市町村/ });
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
}
