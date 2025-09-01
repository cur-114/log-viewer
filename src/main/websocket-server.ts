import { WebSocketServer } from 'ws';
import { BrowserWindow } from 'electron';

const wss = new WebSocketServer({ port: 8080 });

// ビット操作ヘルパー関数
function extractBits(buffer: Buffer, startBit: number, bitCount: number): number {
  if (buffer.length * 8 <= startBit) {
    return 0;
  }

  let result = 0;
  const endBit = startBit + bitCount;

  for (let bit = startBit; bit < endBit && bit < buffer.length * 8; bit++) {
    const byteIndex = Math.floor(bit / 8);
    const bitIndex = bit % 8;

    if (byteIndex < buffer.length) {
      const bitValue = (buffer[byteIndex] >> bitIndex) & 1;
      result |= bitValue << (bit - startBit);
    }
  }

  return result;
}

// 右シフト＆マスク操作のヘルパー関数
function getBitField(buffer: Buffer, rightShift: number, mask: number): number {
  return extractBits(buffer, rightShift, Math.floor(Math.log2(mask)) + 1) & mask;
}

// trb_typeからtype_nameを取得する関数
function getTrbTypeName(type: number): string {
  switch (type) {
    case 1:
      return "Normal";
    case 2:
      return "Setup Stage";
    case 3:
      return "Data Stage";
    case 4:
      return "Status Stage";
    case 6:
      return "Link";
    case 7:
      return "Event Data";
    case 9:
      return "Enable Slot Command";
    case 10:
      return "Disable Slot Command";
    case 11:
      return "Address Device Command";
    case 12:
      return "Configure Endpoint Command";
    case 13:
      return "Evaluate Context Command";
    case 14:
      return "Reset Endpoint Command";
    case 15:
      return "Stop Endpoint Command";
    case 16:
      return "Set TR Dequeue Pointer Command";
    case 17:
      return "Reset Device Command";
    case 32:
      return "Transfer Event";
    case 33:
      return "Command Completion Event";
    case 34:
      return "Port Status Change Event";
    default:
      return "Unknown";
  }
}

// パケットパーサー
function parsePacket(buffer: Buffer) {
  if (buffer.length < 14) {
    throw new Error('パケットが短すぎます（最低14バイト必要）');
  }

  // 全データ共通フィールド: trb_type の計算
  // (data >> 106) & 0x3F をヘルパー関数で取得
  const trb_type = getBitField(buffer, 106, 0x3F);

  // type_nameを取得
  const type_name = getTrbTypeName(trb_type);

  return {
    trb_type: trb_type,
    type_name: type_name,
    data: parsePayload(buffer, trb_type, type_name)
  };
}

// ペイロードの解析
function parsePayload(buffer: Buffer, trb_type: number, type_name: string) {
  const baseData = {
    trb_type: trb_type,
    type_name: type_name
  };

  switch (trb_type) {
    case 32: // Transfer Event
      return {
        ...baseData,
        ...parseTransferEventTRB(buffer),
        raw: buffer
      };
    case 1: // Normal
      return {
        ...baseData,
        ...parseNormalTRB(buffer),
        raw: buffer
      };
    case 7: // Event Data
      return {
        ...baseData,
        ...parseEventDataTRB(buffer),
        raw: buffer
      };
    case 4: // Status Stage
      return {
        ...baseData,
        ...parseStatusStageTRB(buffer),
        raw: buffer
      };
    case 3: // Data Stage
      return {
        ...baseData,
        ...parseDataStageTRB(buffer),
        raw: buffer
      };
    case 2: // Setup Stage
      return {
        ...baseData,
        ...parseSetupStageTRB(buffer),
        raw: buffer
      };
    case 11: // Address Device Command
      return {
        ...baseData,
        ...parseAddressDeviceCommand(buffer),
        raw: buffer
      };
    case 33: // Command Completion Event
      return {
        ...baseData,
        ...parseCommandCompletionEvent(buffer),
        raw: buffer
      };
    case 34: // Port Status Change Event
      return {
        ...baseData,
        ...parsePortStatusChangeEvent(buffer),
        raw: buffer
      };
    default:
      return {
        ...baseData,
        raw: buffer
      };
  }
}

// Setup Stage TRB の解析
function parseSetupStageTRB(buffer: Buffer) {
  // struct TRB_Setup_Stage fields
  const bmRequestType = getBitField(buffer, 0, 0xFF);
  const bRequest = getBitField(buffer, 8, 0xFF);
  const wValue = getBitField(buffer, 16, 0xFFFF);
  const wIndex = getBitField(buffer, 32, 0xFFFF);
  const wLength = getBitField(buffer, 48, 0xFFFF);
  const trbTransferLength = getBitField(buffer, 64, 0x1FFFF);
  const interrupterTarget = getBitField(buffer, 86, 0x3FF);
  const cycleBit = getBitField(buffer, 96, 0x1);
  const interruptOnCompletion = getBitField(buffer, 101, 0x1);
  const immediateData = getBitField(buffer, 102, 0x1);
  const transferType = getBitField(buffer, 112, 0x3);

  console.log('Setup Stage TRB parsed:', { bmRequestType, bRequest, wValue, wIndex, wLength, trbTransferLength, interrupterTarget, cycleBit, interruptOnCompletion, immediateData, transferType });

  return {
    bm_request_type: bmRequestType,
    b_request: bRequest,
    w_value: wValue,
    w_index: wIndex,
    w_length: wLength,
    trb_transfer_length: trbTransferLength,
    interrupter_target: interrupterTarget,
    cycle_bit: cycleBit,
    interrupt_on_completion: interruptOnCompletion,
    immediate_data: immediateData,
    transfer_type: transferType
  };
}

// Data Stage TRB の解析
function parseDataStageTRB(buffer: Buffer) {
  // struct TRB_Data_Stage
  const low = BigInt(getBitField(buffer, 0, 0xFFFFFFFF));
  const high = BigInt(getBitField(buffer, 32, 0xFFFFFFFF));
  const rawPointer = (high << 32n) | low;
  const dataBufferPointer = `0x${rawPointer.toString(16).padStart(16,'0')}`;
  const trbTransferLength = getBitField(buffer, 64, 0x1FFFF);
  const tdSize = getBitField(buffer, 81, 0x1F);
  const interrupterTarget = getBitField(buffer, 86, 0x3FF);
  const cycleBit = getBitField(buffer, 96, 0x1);
  const evaluateNextTrb = getBitField(buffer, 97, 0x1);
  const interruptOnShortPacket = getBitField(buffer, 98, 0x1);
  const noSnoop = getBitField(buffer, 99, 0x1);
  const chainBit = getBitField(buffer, 100, 0x1);
  const interruptOnCompletion = getBitField(buffer, 101, 0x1);
  const immediateData = getBitField(buffer, 102, 0x1);
  const direction = getBitField(buffer, 112, 0x1);

  console.log('Data Stage TRB parsed:', { dataBufferPointer, trbTransferLength, tdSize, interrupterTarget, cycleBit, evaluateNextTrb, interruptOnShortPacket, noSnoop, chainBit, interruptOnCompletion, immediateData, direction });

  return {
    data_buffer_pointer: dataBufferPointer,
    trb_transfer_length: trbTransferLength,
    td_size: tdSize,
    interrupter_target: interrupterTarget,
    cycle_bit: cycleBit,
    evaluate_next_trb: evaluateNextTrb,
    interrupt_on_short_packet: interruptOnShortPacket,
    no_snoop: noSnoop,
    chain_bit: chainBit,
    interrupt_on_completion: interruptOnCompletion,
    immediate_data: immediateData,
    direction: direction
  };
}

// Status Stage TRB の解析
function parseStatusStageTRB(buffer: Buffer) {
  // struct TRB_Status_Stage
  const interrupterTarget = getBitField(buffer, 86, 0x3FF);
  const cycleBit = getBitField(buffer, 96, 0x1);
  const evaluateNextTrb = getBitField(buffer, 97, 0x1);
  const chainBit = getBitField(buffer, 100, 0x1);
  const interruptOnCompletion = getBitField(buffer, 101, 0x1);
  const direction = getBitField(buffer, 112, 0x1);

  console.log('Status Stage TRB parsed:', { interrupterTarget, cycleBit, evaluateNextTrb, chainBit, interruptOnCompletion, direction });
  return {
    interrupter_target: interrupterTarget,
    cycle_bit: cycleBit,
    evaluate_next_trb: evaluateNextTrb,
    chain_bit: chainBit,
    interrupt_on_completion: interruptOnCompletion,
    direction: direction
  };
}

// Event Data TRB の解析
function parseEventDataTRB(buffer: Buffer) {
  // struct TRB_Event_Data
  const low = BigInt(getBitField(buffer, 0, 0xFFFFFFFF));
  const high = BigInt(getBitField(buffer, 32, 0xFFFFFFFF));
  const rawData = (high << 32n) | low;
  const eventData = `0x${rawData.toString(16).padStart(16,'0')}`;
  const interrupterTarget = getBitField(buffer, 86, 0x3FF);
  const cycleBit = getBitField(buffer, 96, 0x1);
  const evaluateNextTrb = getBitField(buffer, 97, 0x1);
  const chainBit = getBitField(buffer, 100, 0x1);
  const interruptOnCompletion = getBitField(buffer, 101, 0x1);
  const blockEventInterrupt = getBitField(buffer, 105, 0x1);

  console.log('Event Data TRB parsed:', { eventData, interrupterTarget, cycleBit, evaluateNextTrb, chainBit, interruptOnCompletion, blockEventInterrupt });
  return {
    event_data: eventData,
    interrupter_target: interrupterTarget,
    cycle_bit: cycleBit,
    evaluate_next_trb: evaluateNextTrb,
    chain_bit: chainBit,
    interrupt_on_completion: interruptOnCompletion,
    block_event_interrupt: blockEventInterrupt
  };
}

// Normal TRB の解析
function parseNormalTRB(buffer: Buffer) {
  // struct TRB_Normal
  const low = BigInt(getBitField(buffer, 0, 0xFFFFFFFF));
  const high = BigInt(getBitField(buffer, 32, 0xFFFFFFFF));
  const rawPointer = (high << 32n) | low;
  const dataBufferPointer = `0x${rawPointer.toString(16).padStart(16,'0')}`;
  const trbTransferLength = getBitField(buffer, 64, 0x1FFFF);
  const tdSize = getBitField(buffer, 81, 0x1F);
  const interrupterTarget = getBitField(buffer, 86, 0x3FF);
  const cycleBit = getBitField(buffer, 96, 0x1);
  const evaluateNextTrb = getBitField(buffer, 97, 0x1);
  const interruptOnShortPacket = getBitField(buffer, 98, 0x1);
  const noSnoop = getBitField(buffer, 99, 0x1);
  const chainBit = getBitField(buffer, 100, 0x1);
  const interruptOnCompletion = getBitField(buffer, 101, 0x1);
  const immediateData = getBitField(buffer, 102, 0x1);
  const blockEventInterrupt = getBitField(buffer, 105, 0x1);
  return {
    data_buffer_pointer: dataBufferPointer,
    trb_transfer_length: trbTransferLength,
    td_size: tdSize,
    interrupter_target: interrupterTarget,
    cycle_bit: cycleBit,
    evaluate_next_trb: evaluateNextTrb,
    interrupt_on_short_packet: interruptOnShortPacket,
    no_snoop: noSnoop,
    chain_bit: chainBit,
    interrupt_on_completion: interruptOnCompletion,
    immediate_data: immediateData,
    block_event_interrupt: blockEventInterrupt
  };
}

// Transfer Event TRB の解析
function parseTransferEventTRB(buffer: Buffer) {
  // struct TRB_Transfer
  const low = BigInt(getBitField(buffer, 0, 0xFFFFFFFF));
  const high = BigInt(getBitField(buffer, 32, 0xFFFFFFFF));
  const rawPointer = (high << 32n) | low;
  const trbPointer = `0x${rawPointer.toString(16).padStart(16,'0')}`;
  const trbTransferLength = getBitField(buffer, 64, 0xFFFFFF);
  const completionCode = getBitField(buffer, 88, 0xFF);
  const cycleBit = getBitField(buffer, 96, 0x1);
  const eventData = getBitField(buffer, 98, 0x1);
  const endpointId = getBitField(buffer, 112, 0x1F);
  const slotId = getBitField(buffer, 120, 0xFF);

  console.log('Transfer Event TRB parsed:', { trbPointer, trbTransferLength, completionCode, cycleBit, eventData, endpointId, slotId });
  return {
    trb_pointer: trbPointer,
    trb_transfer_length: trbTransferLength,
    completion_code: completionCode,
    cycle_bit: cycleBit,
    event_data: eventData,
    endpoint_id: endpointId,
    slot_id: slotId
  };
}

// Address Device Command の解析
function parseAddressDeviceCommand(buffer: Buffer) {
  // struct TRB_Address_Device_Command
  // Input_Context_Pointer: bits 4-63 (60 bits), then left shift 4 bits
  const inLow = BigInt(getBitField(buffer, 4, 0xFFFFFFF));   // lower 28 bits
  const inHigh = BigInt(getBitField(buffer, 32, 0xFFFFFFFF)); // upper 32 bits
  const rawContext = (inHigh << 32n) | inLow;                // 60-bit value
  const shiftedContext = rawContext << 4n;                   // left shift by 4 bits
  const input_context_pointer = `0x${shiftedContext.toString(16).padStart(16, '0')}`;
  // Cycle_Bit: bit 96
  const cycle_bit = getBitField(buffer, 96, 0x1);
  // Block_Set_Address_Request: bit 105
  const block_set_address_request = getBitField(buffer, 105, 0x1);
  // Slot_ID: bits 120-127
  const slot_id = getBitField(buffer, 120, 0xFF);

  console.log('Address Device Command parsed:', { input_context_pointer, cycle_bit, block_set_address_request, slot_id });
  return {
    input_context_pointer,
    cycle_bit,
    block_set_address_request,
    slot_id
  };
}

// Command Completion Event の解析
function parseCommandCompletionEvent(buffer: Buffer) {
  // 構造体定義に基づく正確なビット位置の計算
  // struct TRB_Command_Completion_Event {
  //   uint64_t RsvdZ_0 : 4;                    // bits 0-3
  //   uint64_t Command_TRB_Pointer : 60;       // bits 4-63
  //   uint32_t Command_Completion_Parameter : 24; // bits 64-87
  //   uint32_t Completion_Code : 8;            // bits 88-95
  //   uint32_t Cycle_Bit : 1;                  // bit 96
  //   uint32_t RsvdZ_1 : 9;                    // bits 97-105
  //   uint32_t TRB_Type : 6;                   // bits 106-111
  //   uint32_t VF_ID : 8;                      // bits 112-119
  //   uint32_t Slot_ID : 8;                    // bits 120-127
  // };

  // Command_TRB_Pointer (bits 4-63, 60 bits) and then left shift 4 bits
  const commandTrbPointerLow = BigInt(getBitField(buffer, 4, 0xFFFFFFF)); // lower 28 bits
  const commandTrbPointerHigh = BigInt(getBitField(buffer, 32, 0xFFFFFFFF)); // upper 32 bits
  const rawPointer = (commandTrbPointerHigh << 32n) | commandTrbPointerLow;  // 60-bit value
  const shiftedPointer = rawPointer << 4n; // left shift by 4 bits
  const commandTrbPointer = `0x${shiftedPointer.toString(16).padStart(16,'0')}`;

  // Command_Completion_Parameter (bits 64-87, 24 bits)
  const commandCompletionParameter = getBitField(buffer, 64, 0xFFFFFF);

  // Completion_Code (bits 88-95, 8 bits)
  const completionCode = getBitField(buffer, 88, 0xFF);

  // Cycle_Bit (bit 96, 1 bit)
  const cycleBit = getBitField(buffer, 96, 0x1);

  // VF_ID (bits 112-119, 8 bits)
  const vfId = getBitField(buffer, 112, 0xFF);

  // Slot_ID (bits 120-127, 8 bits)
  const slotId = getBitField(buffer, 120, 0xFF);

  console.log('Command Completion Event parsed:', {
    commandTrbPointer,
    commandCompletionParameter,
    completionCode,
    cycleBit,
    vfId,
    slotId
  });

  return {
    command_trb_pointer: commandTrbPointer,
    command_completion_parameter: commandCompletionParameter,
    completion_code: completionCode,
    cycle_bit: cycleBit,
    vf_id: vfId,
    slot_id: slotId
  };
}

// Port Status Change Event の解析
function parsePortStatusChangeEvent(buffer: Buffer) {
  // Port Status Change Event fields (skip Rsvd fields)
  // Port_ID (bits 24-31)
  const portId = getBitField(buffer, 24, 0xFF);
  // Completion_Code (bits 88-95)
  const completionCode = getBitField(buffer, 88, 0xFF);
  // Cycle_Bit (bit 96)
  const cycleBit = getBitField(buffer, 96, 0x1);

  console.log('Port Status Change Event parsed:', { portId, completionCode, cycleBit });

  return {
    port_id: portId,
    completion_code: completionCode,
    cycle_bit: cycleBit
  };
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    try {
      // Bufferとして処理
      const buffer = Buffer.isBuffer(message) ? message : Buffer.from(message as ArrayBuffer);
      const packet = parsePacket(buffer);

      console.log('Received packet trb_type:', packet.trb_type, '(' + packet.type_name + ')');
      console.log('Parsed data:', packet.data);

      // レンダラープロセスにデータを送信
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        // BufferをArrayに変換してIPC送信可能にする
        const serializedPacket = {
          ...packet,
          data: {
            ...packet.data,
            raw: Array.from(packet.data.raw)
          }
        };

        console.log('Sending serialized packet to renderer:', JSON.stringify(serializedPacket, null, 2));
        mainWindow.webContents.send('log-data', serializedPacket);
      }

    } catch (error) {
      console.error('パケット解析エラー:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('WebSocket server listening on port 8080');

export default wss;
