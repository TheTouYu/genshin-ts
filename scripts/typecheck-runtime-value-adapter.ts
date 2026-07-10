import { ServerExecutionFlowFunctions } from '../src/definitions/nodes.js'
import { asRuntimeValue, generic } from '../src/runtime/value.js'

export function verifyRuntimeValueAdapterTypes(
  f: ServerExecutionFlowFunctions,
  genericValue: generic
): void {
  const floatOutput = genericValue.asType('float')
  const divisionOutput = f.division(floatOutput, 1000)

  const nativeFloat: number = floatOutput
  const nativeDivision: number = divisionOutput
  f.node('set_node_graph_variable', [asRuntimeValue(floatOutput), asRuntimeValue(divisionOutput)])

  void nativeFloat
  void nativeDivision
}
