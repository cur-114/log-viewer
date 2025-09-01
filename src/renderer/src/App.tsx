import 'bootstrap/dist/css/bootstrap.min.css'
import { useState, useEffect } from 'react'

interface PacketData {
  trb_type: number
  type_name: string
  data: any
}

function App(): React.JSX.Element {
  const [packets, setPackets] = useState<PacketData[]>([])

  useEffect(() => {
    // WebSocketからのデータを受信
    const handleLogData = (_event: any, packet: PacketData) => {
      setPackets(prev => [...prev, packet])
    }

    window.electron.ipcRenderer.on('log-data', handleLogData)

    return () => {
      window.electron.ipcRenderer.removeAllListeners('log-data')
    }
  }, [])

  return (
    <div className="container-fluid" style={{ width: '100%', maxWidth: '100%', padding: '0 10px' }}>
      <div className="row">
        <div className="col-12">
          <div className="row">
            {/* 左側: パケットリスト */}
            <div className="col-md-7">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">パケットリスト</h5>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setPackets([])}
                  disabled={packets.length === 0}
                >
                  <i className="bi bi-trash"></i> クリア
                </button>
              </div>
              <div className="packet-list" style={{
                maxHeight: 'calc(100vh - 150px)',
                overflowY: 'auto',
                border: '1px solid #dee2e6',
                borderRadius: '0.375rem',
                padding: '1rem'
              }}>
                {packets.map((packet, index) => (
                  <PacketCard key={index} packet={packet} index={index} />
                ))}
                {packets.length === 0 && (
                  <div className="text-center text-muted py-5">
                    <p>パケットの受信を待機中...</p>
                  </div>
                )}
              </div>
            </div>

            {/* 右側: 統計情報とその他のデータ */}
            <div className="col-md-5">
              <h5>統計情報</h5>
              <div className="card">
                <div className="card-body">
                  <h6 className="card-title">受信データ</h6>
                  <div className="row">
                    <div className="col-6">
                      <div className="text-center">
                        <h4 className="text-primary">{packets.length}</h4>
                        <small className="text-muted">総パケット数</small>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center">
                        <h4 className="text-success">0</h4>
                        <small className="text-muted">毎秒</small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card mt-3">
                <div className="card-body">
                  <h6 className="card-title">パケットタイプ別</h6>
                  <TypeStatistics packets={packets} />
                </div>
              </div>

              <div className="card mt-3">
                <div className="card-body">
                  <h6 className="card-title">接続状況</h6>
                  <div className="d-flex align-items-center">
                    <span className="badge bg-success me-2">●</span>
                    <span>WebSocket接続中</span>
                  </div>
                  <small className="text-muted d-block mt-1">ポート: 8080</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// パケットカードコンポーネント
function PacketCard({ packet, index }: { packet: PacketData; index: number }) {
  return (
    <div className="card mb-3">
      <div className="card-header d-flex justify-content-between align-items-center">
        <span className="badge bg-primary">#{index + 1}</span>
        <span>
          <strong>Type {packet.trb_type}:</strong> {packet.type_name}
        </span>
        <small className="text-muted">{new Date().toLocaleTimeString()}</small>
      </div>
      <div className="card-body">
        {renderPacketContent(packet)}
      </div>
    </div>
  )
}

// パケット内容のレンダリング
function renderPacketContent(packet: PacketData) {
  switch (packet.trb_type) {
    case 32: // Transfer Event
      return <TransferEventTRBCard data={packet.data} />;
    case 1: // Normal
      return <NormalTRBCard data={packet.data} />;
    case 7: // Event Data
      return <EventDataTRBCard data={packet.data} />;
    case 4: // Status Stage
      return <StatusStageTRBCard data={packet.data} />;
    case 3: // Data Stage
      return <DataStageTRBCard data={packet.data} />;
    case 2: // Setup Stage
      return <SetupStageTRBCard data={packet.data} />;
    case 33: // Command Completion Event
      return <CommandCompletionEventCard data={packet.data} />
    case 34: // Port Status Change Event
      return <PortStatusChangeEventCard data={packet.data} />
    case 11: // Address Device Command
      return <AddressDeviceCommandCard data={packet.data} />
    default:
      return <DefaultPacketCard data={packet.data} />
  }
}

// Command Completion Event カード
function CommandCompletionEventCard({ data }: { data: any }) {
  console.log('CommandCompletionEventCard received data:', data);

  const rawBuffer = data.raw as Buffer
  const hexData = rawBuffer ? Array.from(rawBuffer.slice(0, 16))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .reduce((acc, hex, index) => {
      if (index % 4 === 0) acc.push([]);
      acc[acc.length - 1].push(hex);
      return acc;
    }, [] as string[][])
    .map(dword => dword.reverse().join('')) // エンディアンを逆転
    .join(' ') : ''

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">
        {hexData}
      </div>

      <div className="row">
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Command TRB Pointer:</small>
            <div className="font-monospace">{data.command_trb_pointer || 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Completion Parameter:</small>
            <div className="font-monospace">
              {data.command_completion_parameter !== undefined
                ? `0x${data.command_completion_parameter.toString(16).padStart(6, '0')}`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Completion Code:</small>
            <div className="font-monospace">
              {data.completion_code !== undefined
                ? `0x${data.completion_code.toString(16).padStart(2, '0')} (${data.completion_code})`
                : 'N/A'}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">{data.cycle_bit !== undefined ? data.cycle_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">VF ID:</small>
            <div className="font-monospace">
              {data.vf_id !== undefined
                ? `0x${data.vf_id.toString(16).padStart(2, '0')} (${data.vf_id})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Slot ID:</small>
            <div className="font-monospace">
              {data.slot_id !== undefined
                ? `0x${data.slot_id.toString(16).padStart(2, '0')} (${data.slot_id})`
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Port Status Change Event カード
function PortStatusChangeEventCard({ data }: { data: any }) {
  const rawArray = data.raw as number[];
  const hexData = rawArray
    ? rawArray.slice(0, 16)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .reduce((acc, hex, idx) => {
          if (idx % 4 === 0) acc.push([]);
          acc[acc.length - 1].push(hex);
          return acc;
        }, [] as string[][])
        .map(dword => dword.reverse().join(''))
        .join(' ')
    : '';

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">{hexData}</div>
      <div className="row">
        <div className="col-md-4">
          <div className="mb-2">
            <small className="text-muted">Port ID:</small>
            <div className="font-monospace">
              {data.port_id !== undefined
                ? `0x${data.port_id.toString(16).padStart(2, '0')} (${data.port_id})`
                : 'N/A'}
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="mb-2">
            <small className="text-muted">Completion Code:</small>
            <div className="font-monospace">
              {data.completion_code !== undefined
                ? `0x${data.completion_code.toString(16).padStart(2, '0')} (${data.completion_code})`
                : 'N/A'}
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">
              {data.cycle_bit !== undefined ? data.cycle_bit : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Address Device Command カード
function AddressDeviceCommandCard({ data }: { data: any }) {
  const rawArray = data.raw as number[];
  const hexData = rawArray
    ? rawArray.slice(0, 16)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .reduce((acc, hex, idx) => {
          if (idx % 4 === 0) acc.push([]);
          acc[acc.length - 1].push(hex);
          return acc;
        }, [] as string[][])
        .map(dword => dword.reverse().join(''))
        .join(' ')
    : '';
  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">{hexData}</div>
      <div className="row">
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Input Context Pointer:</small>
            <div className="font-monospace">{data.input_context_pointer || 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Block Set Address Request:</small>
            <div className="font-monospace">{data.block_set_address_request}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">{data.cycle_bit}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="mb-2">
            <small className="text-muted">Slot ID:</small>
            <div className="font-monospace">{data.slot_id}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Setup Stage TRB カード
function SetupStageTRBCard({ data }: { data: any }) {
  const rawArray = data.raw as number[];
  const hexData = rawArray
    ? rawArray.slice(0, 16)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .reduce((acc, hex, idx) => {
          if (idx % 4 === 0) acc.push([]);
          acc[acc.length - 1].push(hex);
          return acc;
        }, [] as string[][])
        .map(dword => dword.reverse().join(''))
        .join(' ')
    : '';

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">{hexData}</div>
      <div className="row">
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">bmRequestType:</small>
            <div className="font-monospace">
              {data.bm_request_type !== undefined
                ? `0x${data.bm_request_type.toString(16).padStart(2,'0')} (${data.bm_request_type})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">bRequest:</small>
            <div className="font-monospace">
              {data.b_request !== undefined
                ? `0x${data.b_request.toString(16).padStart(2,'0')} (${data.b_request})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">wValue:</small>
            <div className="font-monospace">
              {data.w_value !== undefined
                ? `0x${data.w_value.toString(16).padStart(4,'0')} (${data.w_value})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">wIndex:</small>
            <div className="font-monospace">
              {data.w_index !== undefined
                ? `0x${data.w_index.toString(16).padStart(4,'0')} (${data.w_index})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">wLength:</small>
            <div className="font-monospace">
              {data.w_length !== undefined
                ? `0x${data.w_length.toString(16).padStart(4,'0')} (${data.w_length})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">TRB Transfer Length:</small>
            <div className="font-monospace">
              {data.trb_transfer_length !== undefined
                ? `0x${data.trb_transfer_length.toString(16).padStart(5,'0')} (${data.trb_transfer_length})`
                : 'N/A'}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Interrupter Target:</small>
            <div className="font-monospace">
              {data.interrupter_target !== undefined
                ? `0x${data.interrupter_target.toString(16).padStart(3,'0')} (${data.interrupter_target})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">
              {data.cycle_bit !== undefined ? data.cycle_bit : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupt On Completion:</small>
            <div className="font-monospace">
              {data.interrupt_on_completion !== undefined ? data.interrupt_on_completion : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Immediate Data:</small>
            <div className="font-monospace">
              {data.immediate_data !== undefined ? data.immediate_data : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Transfer Type:</small>
            <div className="font-monospace">
              {data.transfer_type !== undefined
                ? `0x${data.transfer_type.toString(16)} (${data.transfer_type})`
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Data Stage TRB カード
function DataStageTRBCard({ data }: { data: any }) {
  const rawArray = data.raw as number[];
  const hexData = rawArray
    ? rawArray.slice(0, 16)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .reduce((acc, hex, idx) => {
          if (idx % 4 === 0) acc.push([]);
          acc[acc.length - 1].push(hex);
          return acc;
        }, [] as string[][])
        .map(dword => dword.reverse().join(''))
        .join(' ')
    : '';

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">{hexData}</div>
      <div className="row">
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Data Buffer Pointer:</small>
            <div className="font-monospace">{data.data_buffer_pointer || 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">TRB Transfer Length:</small>
            <div className="font-monospace">
              {data.trb_transfer_length !== undefined
                ? `0x${data.trb_transfer_length.toString(16).padStart(5,'0')} (${data.trb_transfer_length})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">TD Size:</small>
            <div className="font-monospace">
              {data.td_size !== undefined
                ? `0x${data.td_size.toString(16).padStart(2,'0')} (${data.td_size})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupter Target:</small>
            <div className="font-monospace">
              {data.interrupter_target !== undefined
                ? `0x${data.interrupter_target.toString(16).padStart(3,'0')} (${data.interrupter_target})`
                : 'N/A'}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">{data.cycle_bit !== undefined ? data.cycle_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Evaluate Next TRB:</small>
            <div className="font-monospace">{data.evaluate_next_trb !== undefined ? data.evaluate_next_trb : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupt on Short Packet:</small>
            <div className="font-monospace">{data.interrupt_on_short_packet !== undefined ? data.interrupt_on_short_packet : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">No Snoop:</small>
            <div className="font-monospace">{data.no_snoop !== undefined ? data.no_snoop : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Chain Bit:</small>
            <div className="font-monospace">{data.chain_bit !== undefined ? data.chain_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupt On Completion:</small>
            <div className="font-monospace">{data.interrupt_on_completion !== undefined ? data.interrupt_on_completion : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Immediate Data:</small>
            <div className="font-monospace">{data.immediate_data !== undefined ? data.immediate_data : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Direction:</small>
            <div className="font-monospace">
              {data.direction !== undefined
                ? `0x${data.direction.toString(16)} (${data.direction})`
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Status Stage TRB カード
function StatusStageTRBCard({ data }: { data: any }) {
  const rawArray = data.raw as number[];
  const hexData = rawArray
    ? rawArray.slice(0, 16)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .reduce((acc, hex, idx) => {
          if (idx % 4 === 0) acc.push([]);
          acc[acc.length - 1].push(hex);
          return acc;
        }, [] as string[][])
        .map(dword => dword.reverse().join(''))
        .join(' ')
    : '';

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">{hexData}</div>
      <div className="row">
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Interrupter Target:</small>
            <div className="font-monospace">
              {data.interrupter_target !== undefined
                ? `0x${data.interrupter_target.toString(16).padStart(3,'0')} (${data.interrupter_target})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">{data.cycle_bit !== undefined ? data.cycle_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Evaluate Next TRB:</small>
            <div className="font-monospace">{data.evaluate_next_trb !== undefined ? data.evaluate_next_trb : 'N/A'}</div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Chain Bit:</small>
            <div className="font-monospace">{data.chain_bit !== undefined ? data.chain_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupt On Completion:</small>
            <div className="font-monospace">{data.interrupt_on_completion !== undefined ? data.interrupt_on_completion : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Direction:</small>
            <div className="font-monospace">
              {data.direction !== undefined
                ? `0x${data.direction.toString(16)} (${data.direction})`
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Event Data TRB カード
function EventDataTRBCard({ data }: { data: any }) {
  const rawArray = data.raw as number[];
  const hexData = rawArray
    ? rawArray.slice(0, 16)
        .map(b => b.toString(16).padStart(2, '0'))
        .reduce((acc, hex, idx) => {
          if (idx % 4 === 0) acc.push([]);
          acc[acc.length - 1].push(hex);
          return acc;
        }, [] as string[][])
        .map(dword => dword.reverse().join(''))
        .join(' ')
    : '';

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">{hexData}</div>
      <div className="row">
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Event Data:</small>
            <div className="font-monospace">{data.event_data || 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupter Target:</small>
            <div className="font-monospace">
              {data.interrupter_target !== undefined
                ? `0x${data.interrupter_target.toString(16).padStart(3,'0')} (${data.interrupter_target})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">{data.cycle_bit !== undefined ? data.cycle_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Evaluate Next TRB:</small>
            <div className="font-monospace">{data.evaluate_next_trb !== undefined ? data.evaluate_next_trb : 'N/A'}</div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Chain Bit:</small>
            <div className="font-monospace">{data.chain_bit !== undefined ? data.chain_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupt On Completion:</small>
            <div className="font-monospace">{data.interrupt_on_completion !== undefined ? data.interrupt_on_completion : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Block Event Interrupt:</small>
            <div className="font-monospace">{data.block_event_interrupt !== undefined ? data.block_event_interrupt : 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Transfer Event TRB カード
function TransferEventTRBCard({ data }: { data: any }) {
  const rawArray = data.raw as number[];
  const hexData = rawArray
    ? rawArray.slice(0, 16)
        .map(b => b.toString(16).padStart(2, '0'))
        .reduce((acc, hex, idx) => {
          if (idx % 4 === 0) acc.push([]);
          acc[acc.length - 1].push(hex);
          return acc;
        }, [] as string[][])
        .map(dword => dword.reverse().join(''))
        .join(' ')
    : '';

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">{hexData}</div>
      <div className="row">
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">TRB Pointer:</small>
            <div className="font-monospace">{data.trb_pointer || 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">TRB Transfer Length:</small>
            <div className="font-monospace">
              {data.trb_transfer_length !== undefined
                ? `0x${data.trb_transfer_length.toString(16).padStart(6,'0')} (${data.trb_transfer_length})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Completion Code:</small>
            <div className="font-monospace">
              {data.completion_code !== undefined
                ? `0x${data.completion_code.toString(16).padStart(2,'0')} (${data.completion_code})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">{data.cycle_bit !== undefined ? data.cycle_bit : 'N/A'}</div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Event Data:</small>
            <div className="font-monospace">{data.event_data !== undefined ? data.event_data : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Endpoint ID:</small>
            <div className="font-monospace">
              {data.endpoint_id !== undefined
                ? `0x${data.endpoint_id.toString(16).padStart(2,'0')} (${data.endpoint_id})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Slot ID:</small>
            <div className="font-monospace">
              {data.slot_id !== undefined
                ? `0x${data.slot_id.toString(16).padStart(2,'0')} (${data.slot_id})`
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// デフォルトパケットカード
function DefaultPacketCard({ data }: { data: any }) {
  const rawBuffer = data.raw as number[]
  const hexData = rawBuffer ? rawBuffer.slice(0, 16)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .reduce((acc, hex, index) => {
      if (index % 4 === 0) acc.push([]);
      acc[acc.length - 1].push(hex);
      return acc;
    }, [] as string[][])
    .map(dword => dword.reverse().join('')) // エンディアンを逆転
    .join(' ') : ''

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">
        {hexData}
      </div>
    </div>
  )
}

// Normal TRB カード
function NormalTRBCard({ data }: { data: any }) {
  const rawArray = data.raw as number[];
  const hexData = rawArray
    ? rawArray.slice(0, 16)
        .map(b => b.toString(16).padStart(2, '0'))
        .reduce((acc, hex, idx) => {
          if (idx % 4 === 0) acc.push([]);
          acc[acc.length - 1].push(hex);
          return acc;
        }, [] as string[][])
        .map(dword => dword.reverse().join(''))
        .join(' ')
    : '';

  return (
    <div>
      <div className="font-monospace bg-light p-2 rounded mb-3">{hexData}</div>
      <div className="row">
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Data Buffer Pointer:</small>
            <div className="font-monospace">{data.data_buffer_pointer || 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">TRB Transfer Length:</small>
            <div className="font-monospace">
              {data.trb_transfer_length !== undefined
                ? `0x${data.trb_transfer_length.toString(16).padStart(5,'0')} (${data.trb_transfer_length})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">TD Size:</small>
            <div className="font-monospace">
              {data.td_size !== undefined
                ? `0x${data.td_size.toString(16).padStart(2,'0')} (${data.td_size})`
                : 'N/A'}
            </div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupter Target:</small>
            <div className="font-monospace">
              {data.interrupter_target !== undefined
                ? `0x${data.interrupter_target.toString(16).padStart(3,'0')} (${data.interrupter_target})`
                : 'N/A'}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="mb-2">
            <small className="text-muted">Cycle Bit:</small>
            <div className="font-monospace">{data.cycle_bit !== undefined ? data.cycle_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Evaluate Next TRB:</small>
            <div className="font-monospace">{data.evaluate_next_trb !== undefined ? data.evaluate_next_trb : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupt on Short Packet:</small>
            <div className="font-monospace">{data.interrupt_on_short_packet !== undefined ? data.interrupt_on_short_packet : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">No Snoop:</small>
            <div className="font-monospace">{data.no_snoop !== undefined ? data.no_snoop : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Chain Bit:</small>
            <div className="font-monospace">{data.chain_bit !== undefined ? data.chain_bit : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Interrupt On Completion:</small>
            <div className="font-monospace">{data.interrupt_on_completion !== undefined ? data.interrupt_on_completion : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Immediate Data:</small>
            <div className="font-monospace">{data.immediate_data !== undefined ? data.immediate_data : 'N/A'}</div>
          </div>
          <div className="mb-2">
            <small className="text-muted">Block Event Interrupt:</small>
            <div className="font-monospace">{data.block_event_interrupt !== undefined ? data.block_event_interrupt : 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// パケットタイプ別統計コンポーネント
function TypeStatistics({ packets }: { packets: PacketData[] }) {
  const typeStats = packets.reduce((acc, packet) => {
    const key = `${packet.trb_type}: ${packet.type_name}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedStats = Object.entries(typeStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10); // 上位10件のみ表示

  if (sortedStats.length === 0) {
    return <p className="text-muted">データなし</p>;
  }

  return (
    <div>
      {sortedStats.map(([type, count]) => (
        <div key={type} className="d-flex justify-content-between align-items-center mb-2">
          <small className="text-truncate" style={{ maxWidth: '75%' }}>
            {type}
          </small>
          <span className="badge bg-secondary">{count}</span>
        </div>
      ))}
      {Object.keys(typeStats).length > 10 && (
        <small className="text-muted">...他 {Object.keys(typeStats).length - 10} 件</small>
      )}
    </div>
  );
}

export default App
