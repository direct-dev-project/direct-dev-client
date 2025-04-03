/**
 * Utility to print Wire strings in binary output format for easier debugging.
 */
export function wireStringToBinary(input: string) {
  let output = "";
  for (let i = 0, j = input.length; i < j; i++) {
    const byte = input.charCodeAt(i);

    if (byte < 256) {
      if (output.length) {
        output += " ";
      }

      const bit1 = byte & 0b10000000 ? "1" : "0";
      const bit2 = byte & 0b01000000 ? "1" : "0";
      const bit3 = byte & 0b00100000 ? "1" : "0";
      const bit4 = byte & 0b00010000 ? "1" : "0";
      const bit5 = byte & 0b00001000 ? "1" : "0";
      const bit6 = byte & 0b00000100 ? "1" : "0";
      const bit7 = byte & 0b00000010 ? "1" : "0";
      const bit8 = byte & 0b00000001 ? "1" : "0";

      output += bit1 + bit2 + bit3 + bit4 + bit5 + bit6 + bit7 + bit8;

      if (i < j - 1) {
        output += " ";
      }
    } else {
      output += input.charAt(i);
    }
  }

  return output;
}
