import { CampaignInstanceManagementService } from "./campaign-instance-management.service";
it("projects a populated roster with expired invitations and contact-free delivery status", async () => {
  const at = new Date("2020-01-01T00:00:00Z");
  const service = new CampaignInstanceManagementService({
    campaignInstance: {findFirst: jest.fn().mockResolvedValue({id:"instance",name:"Tuesday group"})},
    campaignInstanceHumanMembership: {findMany: jest.fn().mockResolvedValue([{id:"gm",displayName:"Morgan",role:"GM",status:"ACTIVE",joinedAt:at,leftAt:null}])},
    campaignInstanceInvitation: {findMany: jest.fn().mockResolvedValue([{id:"invite",invitedName:null,role:"PLAYER",status:"PENDING",expiresAt:at,createdAt:at,emailEncrypted:"private ciphertext",phoneEncrypted:"private phone",deliveryAttempts:[{channel:"EMAIL",status:"FAILED",failureCategory:"provider private error",attemptedAt:at}]}])},
    campaignInstanceAgentParticipation: {findMany: jest.fn().mockResolvedValue([{id:"agent",agentName:"Guide",status:"AUTHORIZED",observeCapabilities:["aow:observe"],actCapabilities:[]}])},
    campaignInstanceCharacterAssociation: {findMany: jest.fn().mockResolvedValue([{characterId:"character",characterName:"Rowan",status:"DRAFT",playerMembershipId:"player",playerMembership:{displayName:"Alex"},draft:null}])},
  } as never);
  const result = await service.roster("instance","owner");
  expect(result.invitations[0]).toMatchObject({invitedName:"Invited participant",status:"expired",delivery:[{channel:"email",status:"failed",failureMessage:"Delivery failed; retry the invitation."}]});
  expect(result.characters[0]).toMatchObject({name:"Rowan",playerName:"Alex",sheetStatus:"in-progress",readiness:"blocked"});
  expect(result.memberships[0]).toMatchObject({displayName:"Morgan",role:"gm",status:"active"});
  expect(result.agents[0]).toMatchObject({name:"Guide",status:"authorized"});
  expect(JSON.stringify(result)).not.toContain("private");
});
