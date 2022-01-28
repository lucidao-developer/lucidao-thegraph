import { ProposalUserVote, ProposalStatus } from '../generated/schema';
import { Address, BigDecimal, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  LucidaoGovernor,
  ProposalCanceled,
  ProposalCreated,
  ProposalExecuted,
  ProposalQueued,
  QuorumNumeratorUpdated,
  TimelockChange,
  VoteCast
} from "../generated/LucidaoGovernor/LucidaoGovernor"
import { ProposalEntity } from "../generated/schema"

namespace ProposalState {
  const Pending = "Pending";
  const Active = "Active";
  const Canceled = "Canceled";
  const Defeated = "Defeated";
  const Succeeded = "Succeeded";
  const Queued = "Queued";
  const Expired = "Expired";
  const Executed = "Executed";
}
type ProposalState = string;

function getOrCreateProposalEntity(proposalId: BigInt): ProposalEntity {
  let proposalEntity = ProposalEntity.load(proposalId.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!proposalEntity) {
    proposalEntity = new ProposalEntity(proposalId.toHex())
  }
  return proposalEntity;
}

function getOrCreateVote(event: VoteCast): ProposalUserVote {
  let voteId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let voteEntity = ProposalUserVote.load(voteId)

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!voteEntity) {
    voteEntity = new ProposalUserVote(voteId)
  }

  voteEntity.weight = event.params.weight;
  voteEntity.support = event.params.support;
  voteEntity.voter = event.params.voter;
  voteEntity.reason = event.params.reason;
  voteEntity.block = event.block.number;
  voteEntity.blockTimestamp = event.block.timestamp;

  return voteEntity;
}

function setProposalStatus(proposalId: BigInt, proposalEntity: ProposalEntity, status: string, eventBlock: ethereum.Block, eventAddress: Address): void {
  let statusId = proposalEntity.id + "-" + eventBlock.number.toString();
  let statusEntity = ProposalStatus.load(statusId);

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!statusEntity) {
    statusEntity = new ProposalStatus(statusId);
  }

  statusEntity.status = status;
  statusEntity.statusBlockNumber = eventBlock.number;
  statusEntity.statusBlockTimestamp = eventBlock.timestamp;
  statusEntity.proposal = proposalEntity.id;
  statusEntity.save();
  // let contract = LucidaoGovernor.bind(eventAddress);
  // chainStatus = contract.state(proposalId);
}

function setManualProposalStatus(proposalId: BigInt, proposalEntity: ProposalEntity, status: string, eventBlock: ethereum.Block, eventAddress: Address, blockDelay: BigInt): void {
  let estimatedBlockNumber: BigInt = eventBlock.number.plus(blockDelay);
  let mintingBlockEstimationInSeconds = BigDecimal.fromString("0.86")
  let timestampDelta: BigInt = BigInt.fromString(blockDelay.toBigDecimal().times(mintingBlockEstimationInSeconds).truncate(0).toString());
  let estimatedTimestamp: BigInt = eventBlock.timestamp.plus(timestampDelta);
  let statusId = proposalEntity.id + "-" + estimatedBlockNumber.toString();
  let statusEntity = ProposalStatus.load(statusId);

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!statusEntity) {
    statusEntity = new ProposalStatus(statusId);
  }

  statusEntity.status = status;
  statusEntity.statusBlockNumber = estimatedBlockNumber;
  statusEntity.statusBlockTimestamp = estimatedTimestamp;
  statusEntity.proposal = proposalEntity.id;
  statusEntity.save();
}

function slugify(myText: string): string {
  const fromChar: string[] = "àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìıİłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;#[]+".split("");
  const toChar: string[] = "aaaaaaaaaacccddeeeeeeeegghiiiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz----      ".split("");

  let slug = myText.toLowerCase();
  for (var _i = 0; _i < fromChar.length; _i++) {
    slug = slug.replaceAll(fromChar[_i], toChar[_i]);
  }
  slug = slug.split(" ").map<string>(y => y.trim()).filter(x => x.length > 0).join("_");
  slug = slug.replaceAll("-_", "-");
  slug = slug.replaceAll("_-", "-");
  return slug;
}

function createWebId(blockNumber: BigInt, proposalDescription: string): string {
  //SPEC: <discourse id>-<will be ignored>-<Breve descrizione>
  //Esempio1:  15 - [FLP #1] - Hello World
  //Esempio2: 15-FLP-Vision: Become immortal
  const proposalDescriptionChunks = proposalDescription.split("-");
  if(proposalDescriptionChunks.length==1){
    const slug = slugify(proposalDescription);
    return `${blockNumber.toString()}-${slug}`;
  }
  const proposalDiscourseID = slugify(proposalDescriptionChunks[0]);
  const slug = slugify(proposalDescriptionChunks[proposalDescriptionChunks.length - 1]);
  return `${proposalDiscourseID}-${slug}`;
}

function manageArrayParameters(proposalEntity: ProposalEntity, targets: ethereum.Value, callDatas: Bytes[], signatures: string[], values: BigInt[], parameters: ethereum.EventParam[]): ProposalEntity {
  if (!proposalEntity.signatures) {
    proposalEntity.signatures = [] as string[];
  }

  proposalEntity.signatures = signatures;
  //proposalEntity.targets = event.params.targets; //https://github.com/graphprotocol/graph-ts/issues/246
  let parsedTargets = [] as string[];
  let targetsValues = targets.toArray();
  for (var _i = 0; _i < targetsValues.length; _i++) {
    parsedTargets.push(targetsValues[_i].toAddress().toHex().toString());
  }

  proposalEntity.targets = parsedTargets;
  proposalEntity.values = values;

  // proposalEntity.parametersName = [] as string[];
  // proposalEntity.parametersValue = [] as string[];
  // for (var _j = 0; _j < parameters.length; _j++) {
  //   const ev = parameters[_j];
  //   proposalEntity.parametersName.push(ev.name);
  //   proposalEntity.parametersValue.push(ev.value.toString());
  // }
  proposalEntity.callDatas = callDatas;
  return proposalEntity;
}

export function handleProposalCanceled(event: ProposalCanceled): void {
  let proposalEntity = getOrCreateProposalEntity(event.params.proposalId);
  proposalEntity.save();
  setProposalStatus(event.params.proposalId, proposalEntity, ProposalState.Canceled, event.block, event.address);

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.BALLOT_TYPEHASH(...)
  // - contract.COUNTING_MODE(...)
  // - contract.castVote(...)
  // - contract.castVoteBySig(...)
  // - contract.castVoteWithReason(...)
  // - contract.getVotes(...)
  // - contract.hasVoted(...)
  // - contract.hashProposal(...)
  // - contract.name(...)
  // - contract.proposalDeadline(...)
  // - contract.proposalEta(...)
  // - contract.proposalSnapshot(...)
  // - contract.proposalThreshold(...)
  // - contract.proposalVotes(...)
  // - contract.propose(...)
  // - contract.queue(...)
  // - contract.quorum(...)
  // - contract.quorumDenominator(...)
  // - contract.quorumNumerator(...)
  // - contract.state(...)
  // - contract.supportsInterface(...)
  // - contract.timelock(...)
  // - contract.token(...)
  // - contract.version(...)
  // - contract.votingDelay(...)
  // - contract.votingPeriod(...)
}

export function handleProposalCreated(event: ProposalCreated): void {
  let proposalEntity = getOrCreateProposalEntity(event.params.proposalId);
  proposalEntity.webId = createWebId(event.params.startBlock, event.params.description);
  proposalEntity.description = event.params.description;
  proposalEntity.startBlock = event.params.startBlock;
  proposalEntity.endBlock = event.params.endBlock;
  proposalEntity.transaction = event.transaction.hash.toHex();
  proposalEntity.proposer = event.params.proposer;

  proposalEntity = manageArrayParameters(proposalEntity, event.parameters[2].value, event.params.calldatas, event.params.signatures, event.params.values, event.parameters);
  proposalEntity.save()
  setProposalStatus(event.params.proposalId, proposalEntity, ProposalState.Pending, event.block, event.address);
  let contract = LucidaoGovernor.bind(event.address)
  let votingPeriod: BigInt = contract.votingPeriod();
  let votingDelay: BigInt = contract.votingDelay();
  let votingExpiration: BigInt = votingPeriod.plus(votingDelay);

  setManualProposalStatus(event.params.proposalId, proposalEntity, ProposalState.Active, event.block, event.address, votingDelay);
  setManualProposalStatus(event.params.proposalId, proposalEntity, ProposalState.Expired, event.block, event.address, votingExpiration);
}

export function handleProposalExecuted(event: ProposalExecuted): void {
  let proposalEntity = getOrCreateProposalEntity(event.params.proposalId);
  proposalEntity.save()
  setProposalStatus(event.params.proposalId, proposalEntity, ProposalState.Executed, event.block, event.address);
}

export function handleProposalQueued(event: ProposalQueued): void {
  let proposalEntity = getOrCreateProposalEntity(event.params.proposalId);
  proposalEntity.save()
  setProposalStatus(event.params.proposalId, proposalEntity, ProposalState.Queued, event.block, event.address);
}

export function handleQuorumNumeratorUpdated(
  event: QuorumNumeratorUpdated
): void { }

export function handleTimelockChange(event: TimelockChange): void { }

export function handleVoteCast(event: VoteCast): void {
  let proposalEntity = getOrCreateProposalEntity(event.params.proposalId);
  let vote = getOrCreateVote(event);
  vote.proposal = proposalEntity.id;
  vote.save();
}